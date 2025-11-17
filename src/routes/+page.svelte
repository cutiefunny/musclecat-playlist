<script>
	import { onMount } from 'svelte';
	// Firebase 설정 파일에서 auth 관련 함수들 추가로 가져오기
	import { db, storage, auth, onAuthStateChanged, login, logout } from '$lib/firebase.js';

	// Firebase SDK 함수들 가져오기
	import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
	import {
		collection,
		addDoc,
		query,
		onSnapshot,
		serverTimestamp,
		deleteDoc,
		doc,
		updateDoc,
		orderBy
	} from 'firebase/firestore';

	// --- 상태 변수들 ---
	let songs = [];
	let currentSong = null;
	let isLoading = false;
	let audioEl;
	let statusMessage = '플레이리스트 로딩 중...';

	let isShuffle = false;
	let playQueue = [];
	let currentListIndex = -1;
	let currentQueueIndex = -1;

	// --- 1. 인증 상태 변수 ---
	let currentUser = null;
	let isAdmin = false;
	const ADMIN_EMAIL = 'cutiefunny@gmail.com'; // 관리자 이메일

	// --- 2. 수정 상태 변수 ---
	let editingSongId = null; // 현재 수정 중인 곡의 ID
	let editTitle = ''; // 수정 중인 제목
	let editArtist = ''; // 수정 중인 아티스트

	// --- 3. 지점(Branch) 상태 변수 ---
	let currentBranch = 'branch2'; // 'branch1' 또는 'branch2'
	let unsubscribeFirestore = () => {}; // Firestore 리스너 해제 함수

	// [신규] 리스너가 채울 목록 (최상위로 이동)
	let branchSongsList = []; // 'libraries/branchX/songs' 목록
	let oldSongsList = []; // 'songs' (기존) 목록

	// --- 4. Auth 상태 감지 (onMount) ---
	onMount(() => {
		// Firebase Auth 상태 감지 리스너
		const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
			currentUser = user;
			isAdmin = user?.email === ADMIN_EMAIL;
			// 로그아웃 시 수정 모드 강제 해제
			if (!isAdmin) {
				cancelEdit();
			}

			if (user) {
				if (isAdmin) {
					statusMessage = '관리자님, 환영합니다. (파일 업로드 가능)';
				} else {
					statusMessage = '감상 모드';
				}
			} else {
				statusMessage = '로그인하여 음악을 감상하세요. (관리자는 클릭)';
			}
		});

		// 컴포넌트 파괴 시 리스너 정리
		return () => {
			unsubscribeFirestore(); // 데이터 리스너
			unsubscribeAuth(); // 인증 리스너
		};
	});

	// --- 5. [신규] 곡 문서 경로 헬퍼 ---
	/**
	 * 곡 객체의 isOld 플래그를 기반으로 올바른 Firestore 문서 참조를 반환합니다.
	 * isOld: true -> 'songs/{id}'
	 * isOld: false -> 'libraries/{currentBranch}/songs/{id}'
	 */
	function getSongDocRef(song) {
		if (song.isOld) {
			return doc(db, 'songs', song.id);
		} else {
			// new song (branch1 or branch2)
			return doc(db, 'libraries', currentBranch, 'songs', song.id);
		}
	}

	// --- 6. [신규] 목록 병합 및 상태 업데이트 함수 (최상위로 이동) ---
	// (onSnapshot 콜백에서 이 함수를 호출)
	function updateMergedList() {
		const combined = [...branchSongsList, ...oldSongsList];

		// [중요] 두 컬렉션을 합쳤으므로 클라이언트에서 'order' 기준으로 다시 정렬
		combined.sort((a, b) => (a.order || 0) - (b.order || 0));

		songs = combined; // 메인 상태 업데이트

		// --- 목록 변경에 따른 후속 상태 업데이트 ---
		cancelEdit(); // 목록 새로고침 시 수정 모드 해제
		if (!isShuffle) {
			playQueue = [...songs];
			currentQueueIndex = currentSong ? playQueue.findIndex((s) => s.id === currentSong.id) : -1;
		}
		currentListIndex = currentSong ? songs.findIndex((s) => s.id === currentSong.id) : -1;

		// --- 상태 메시지 업데이트 ---
		if (isAdmin) statusMessage = '관리자 모드';
		else if (currentUser) statusMessage = '감상 모드';
		else statusMessage = '로그인 필요';
	}

	// --- 7. [신규] Firestore 구독 로직 함수 ---
	function subscribeToBranch(branch) {
		// db가 아직 초기화되지 않았으면 실행 중지
		if (!db) return;

		// 1. 기존 리스너가 있다면 모두 해제
		unsubscribeFirestore();

		let unsubBranchSongs = () => {};
		let unsubOldSongs = () => {};

		// 2. 목록 변수 초기화
		branchSongsList = [];
		oldSongsList = [];

		if (branch === 'branch1') {
			// --- 1호점 로직 (단일 컬렉션) ---
			statusMessage = '1호점 목록 로딩 중...';
			const q = query(
				collection(db, 'libraries', 'branch1', 'songs'),
				orderBy('order', 'asc')
			);

			unsubBranchSongs = onSnapshot(
				q,
				(querySnapshot) => {
					branchSongsList = []; // 1호점 목록 채우기
					querySnapshot.forEach((doc) => {
						branchSongsList.push({ id: doc.id, ...doc.data(), isOld: false });
					});
					oldSongsList = []; // 1호점일 땐 기존 곡 목록 비움
					updateMergedList(); // 병합 및 정렬
				},
				(error) => {
					console.error('Error loading branch 1 songs:', error);
					statusMessage = '1호점 목록을 불러오는 데 실패했습니다.';
				}
			);

			// 1호점은 리스너가 1개
			unsubscribeFirestore = () => {
				unsubBranchSongs();
			};
		} else if (branch === 'branch2') {
			// --- 2호점 로직 (병합) ---
			statusMessage = '2호점 목록 로딩 중...';

			// 리스너 1: 'libraries/branch2/songs' (신규 2호점 곡)
			const qBranch2 = query(
				collection(db, 'libraries', 'branch2', 'songs'),
				orderBy('order', 'asc') // (부분 정렬)
			);
			unsubBranchSongs = onSnapshot(
				qBranch2,
				(querySnapshot) => {
					branchSongsList = [];
					querySnapshot.forEach((doc) => {
						branchSongsList.push({ id: doc.id, ...doc.data(), isOld: false });
					});
					updateMergedList(); // (oldSongsList와) 병합 및 정렬
				},
				(error) => {
					console.error('Error loading branch 2 songs:', error);
					statusMessage = '2호점 신규 목록 로딩 실패.';
				}
			);

			// 리스너 2: 'songs' (기존 곡)
			const qOld = query(collection(db, 'songs'), orderBy('order', 'asc')); // (부분 정렬)

			unsubOldSongs = onSnapshot(
				qOld,
				(querySnapshot) => {
					oldSongsList = [];
					querySnapshot.forEach((doc) => {
						oldSongsList.push({ id: doc.id, ...doc.data(), isOld: true });
					});
					updateMergedList(); // (branchSongsList와) 병합 및 정렬
				},
				(error) => {
					console.error('Error loading OLD songs:', error);
					statusMessage = '2호점 기존 목록 로딩 실패.';
				}
			);

			// 2호점은 리스너가 2개이므로, 둘 다 해제하는 함수를 만듦
			unsubscribeFirestore = () => {
				unsubBranchSongs();
				unsubOldSongs();
			};
		}
	}

	// --- 8. [수정] 반응형 구독 실행 ---
	// currentBranch가 변경될 때만 subscribeToBranch 함수를 호출 (무한 루프 방지)
	$: subscribeToBranch(currentBranch);

	// --- 9. 지점(Branch) 전환 함수 ---
	function switchBranch(branchId) {
		if (branchId === currentBranch || isLoading || editingSongId) {
			return;
		}
		currentBranch = branchId;

		// 지점 변경 시 플레이어 및 상태 초기화
		currentSong = null;
		if (audioEl) {
			audioEl.pause();
			audioEl.src = '';
		}
		songs = []; // :$ 블록이 자동으로 다시 채울 것임
		playQueue = [];
		currentListIndex = -1;
		currentQueueIndex = -1;
	}

	// --- 10. 로그인/로그아웃 토글 함수 ---
	async function handleAuthToggle() {
		if (isLoading || editingSongId) return; // 수정 중일 때 방지
		if (currentUser) {
			isLoading = true;
			statusMessage = '로그아웃 중...';
			await logout();
			isLoading = false;
		} else {
			isLoading = true;
			statusMessage = 'Google 계정으로 로그인 중...';
			try {
				await login();
			} catch (error) {
				console.error('Login failed:', error);
				statusMessage = '로그인에 실패했습니다.';
			} finally {
				isLoading = false;
			}
		}
	}

	// --- 11. 파일 업로드 ---
	async function handleFileUpload(event) {
		const files = event.target.files;
		if (!files || files.length === 0) return;
		if (!isAdmin) {
			statusMessage = '업로드 권한이 없습니다.';
			return;
		}

		isLoading = true;
		statusMessage = `${files.length}개 파일 업로드 시작... (${
			currentBranch === 'branch1' ? '1호점' : '2호점'
		}에 저장)`;
		let successCount = 0;
		let errorCount = 0;

		try {
			for (const file of files) {
				const currentFileIndex = successCount + errorCount + 1;
				statusMessage = `(${currentFileIndex}/${files.length}) '${file.name}' 처리 중...`;
				try {
					const fileNameOnly = file.name.replace(/\.[^/.]+$/, '');
					const parts = fileNameOnly.split(' - ');
					const artist = parts[0] || '아티스트 없음';
					const title = parts[1] || fileNameOnly;
					const metadata = { title: title, artist: artist, album: ' ' };

					const storageRef = ref(storage, `music/${Date.now()}_${file.name}`);
					const snapshot = await uploadBytes(storageRef, file);
					const downloadURL = await getDownloadURL(snapshot.ref);

					// 2호점 선택 시 currentBranch='branch2'이므로 'libraries/branch2/songs'에 저장됨
					await addDoc(collection(db, 'libraries', currentBranch, 'songs'), {
						...metadata,
						src: downloadURL,
						fileName: file.name,
						createdAt: serverTimestamp(),
						order: Date.now()
					});
					successCount++;
				} catch (fileError) {
					console.error(`'${file.name}' 업로드 실패:`, fileError);
					errorCount++;
				}
			}
		} catch (batchError) {
			console.error('배치 업로드 중 예기치 않은 오류:', batchError);
			statusMessage = '배치 업로드 중 심각한 오류 발생.';
		} finally {
			isLoading = false;
			statusMessage = `업로드 완료: ${successCount}개 성공, ${errorCount}개 실패.`;
			event.target.value = '';
		}
	}

	// --- 12. 순서 변경 함수 ---
	async function moveSong(currentIndex, direction) {
		if (!isAdmin || editingSongId) return;
		const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
		if (newIndex < 0 || newIndex >= songs.length) return;
		isLoading = true;
		try {
			const songA = songs[currentIndex];
			const songB = songs[newIndex];

			const docRefA = getSongDocRef(songA);
			const docRefB = getSongDocRef(songB);

			await updateDoc(docRefA, { order: songB.order });
			await updateDoc(docRefB, { order: songA.order });
		} catch (error) {
			console.error('Failed to update order:', error);
			statusMessage = '순서 변경에 실패했습니다.';
		} finally {
			isLoading = false;
		}
	}

	// --- 13. 수정 관련 함수 ---
	function startEdit(song) {
		editingSongId = song.id;
		editTitle = song.title;
		editArtist = song.artist;
	}

	function cancelEdit() {
		editingSongId = null;
		editTitle = '';
		editArtist = '';
	}

	async function saveEdit(songId) {
		if (!isAdmin || !editingSongId || songId !== editingSongId) return;
		if (!editTitle.trim() || !editArtist.trim()) {
			statusMessage = '제목과 아티스트는 비워둘 수 없습니다.';
			return;
		}

		isLoading = true;
		statusMessage = '정보 업데이트 중...';

		try {
			const songToSave = songs.find((s) => s.id === songId);
			if (!songToSave) throw new Error('Song not found in list.');

			const docRef = getSongDocRef(songToSave);
			await updateDoc(docRef, {
				title: editTitle.trim(),
				artist: editArtist.trim()
			});
			statusMessage = '업데이트 완료.';
		} catch (error) {
			console.error('Failed to update song info:', error);
			statusMessage = '업데이트에 실패했습니다.';
		} finally {
			isLoading = false;
			cancelEdit(); // 수정 모드 종료
		}
	}

	// --- 14. 셔플, 재생, 다음/이전 (로직 동일) ---
	function getShuffledArray(array) {
		const newArr = [...array];
		for (let i = newArr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[newArr[i], newArr[j]] = [newArr[j], newArr[i]];
		}
		return newArr;
	}

	function toggleShuffle() {
		isShuffle = !isShuffle;
		if (isShuffle) {
			const otherSongs = songs.filter((s) => s.id !== currentSong?.id);
			const shuffledOtherSongs = getShuffledArray(otherSongs);
			playQueue = currentSong ? [currentSong, ...shuffledOtherSongs] : getShuffledArray(songs);
		} else {
			playQueue = [...songs];
		}
		currentQueueIndex = currentSong ? playQueue.findIndex((s) => s.id === currentSong.id) : -1;
	}

	function playSong(song) {
		if (editingSongId) return;
		currentSong = song;
		if (isShuffle) {
			const otherSongs = songs.filter((s) => s.id !== song.id);
			playQueue = [song, ...getShuffledArray(otherSongs)];
			currentQueueIndex = 0;
		} else {
			playQueue = [...songs];
			currentQueueIndex = songs.findIndex((s) => s.id === song.id);
		}
		currentListIndex = songs.findIndex((s) => s.id === song.id);
	}

	function playNext() {
		if (playQueue.length === 0) return;
		let nextIndex = currentQueueIndex + 1;
		if (nextIndex >= playQueue.length) {
			nextIndex = 0;
		}
		currentQueueIndex = nextIndex;
		currentSong = playQueue[currentQueueIndex];
		currentListIndex = songs.findIndex((s) => s.id === currentSong.id);
	}

	function playPrevious() {
		if (playQueue.length === 0) return;
		let prevIndex = currentQueueIndex - 1;
		if (prevIndex < 0) {
			prevIndex = playQueue.length - 1;
		}
		currentQueueIndex = prevIndex;
		currentSong = playQueue[currentQueueIndex];
		currentListIndex = songs.findIndex((s) => s.id === currentSong.id);
	}

	// --- 15. Media Session API (로직 동일) ---
	function setupMediaSession() {
		if (!('mediaSession' in navigator) || !currentSong) return;
		const metadata = {
			title: currentSong.title,
			artist: currentSong.artist || '아티스트 없음',
			album: currentSong.album || ' '
		};
		navigator.mediaSession.metadata = new MediaMetadata(metadata);
		navigator.mediaSession.setActionHandler('play', () => {
			audioEl?.play();
			navigator.mediaSession.playbackState = 'playing';
		});
		navigator.mediaSession.setActionHandler('pause', () => {
			audioEl?.pause();
			navigator.mediaSession.playbackState = 'paused';
		});
		navigator.mediaSession.setActionHandler('nexttrack', playNext);
		navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
	}

	function onPlay() {
		if (audioEl) {
			navigator.mediaSession.playbackState = 'playing';
			setupMediaSession();
		}
	}
	function onPause() {
		navigator.mediaSession.playbackState = 'paused';
	}
	function onEnded() {
		console.log('Song ended, playing next.');
		playNext();
	}

	// --- 16. 음원 삭제 기능 ---
	async function deleteSong(songToDelete) {
		if (!isAdmin || editingSongId) return;
		if (!songToDelete) return;

		isLoading = true;
		statusMessage = `'${songToDelete.title}' 삭제 중...`;
		try {
			// 큐(Queue)에서 제거
			const queueIndex = playQueue.findIndex((s) => s.id === songToDelete.id);
			if (queueIndex > -1) {
				playQueue.splice(queueIndex, 1);
			}
			if (currentSong?.id === songToDelete.id) {
				if (audioEl) {
					audioEl.pause();
					audioEl.src = '';
				}
				currentSong = null;
				currentQueueIndex = -1;
				currentListIndex = -1;
			}

			// Firestore 문서 경로 가져오기
			const docRef = getSongDocRef(songToDelete);

			// Storage 삭제
			if (songToDelete.src) {
				const audioRef = ref(storage, songToDelete.src);
				await deleteObject(audioRef);
			}

			// Firestore 문서 삭제
			await deleteDoc(docRef);
			statusMessage = `'${songToDelete.title}' 삭제 완료.`;
		} catch (error) {
			console.error('Error deleting song:', error);
			statusMessage = '삭제 중 오류가 발생했습니다.';
		} finally {
			isLoading = false;
		}
	}
</script>

<main>
	<h1 on:click={handleAuthToggle} title="관리자 로그인/로그아웃 (클릭)">
		근육고양이 플레이리스트
	</h1>

	<!-- 지점(Branch) 선택 UI -->
	<div class="branch-selector">
		<button
			class:active={currentBranch === 'branch1'}
			on:click={() => switchBranch('branch1')}
			disabled={isLoading || editingSongId}
		>
			1호점 라이브러리
		</button>
		<button
			class:active={currentBranch === 'branch2'}
			on:click={() => switchBranch('branch2')}
			disabled={isLoading || editingSongId}
		>
			2호점 라이브러리
		</button>
	</div>

	<!-- 업로드 섹션 -->
	{#if isAdmin || !currentUser}
		<div class="card">
			{#if isAdmin}
				<label for="file-upload" class="file-label" class:disabled={isLoading}>
					{isLoading ? '처리 중...' : '음원 파일 선택'}
				</label>
				<input
					id="file-upload"
					type="file"
					accept="audio/*"
					on:change={handleFileUpload}
					style="display: none;"
					disabled={isLoading}
					multiple
				/>
			{/if}
			<span class="statusMessage">{statusMessage}</span>
		</div>
	{/if}

	<!-- 플레이어 -->
	{#if currentSong}
		<div class="player-wrapper">
			<div class="player-info">
				<p class="now-playing">
					<strong>{currentSong.title}</strong>
					<span>{currentSong.artist}</span>
				</p>
				<audio
					bind:this={audioEl}
					src={currentSong.src}
					controls
					controlsList="nodownload"
					autoplay
					on:play={onPlay}
					on:pause={onPause}
					on:ended={onEnded}
				>
					<p>お使い의 ブラウザは audio 要素를 지원하지 않습니다.</p>
				</audio>
			</div>
		</div>
	{/if}

	<div class="playlist-wrapper">
		<div class="playlist-header">
			<h2 class="library-title">
				<!-- [수정] 2호점 타이틀 변경 -->
				{currentBranch === 'branch1' ? '1호점' : '2호점'}
			</h2>
			<button
				type="button"
				class="shuffle-button"
				class:active={isShuffle}
				on:click={toggleShuffle}
				title={isShuffle ? '셔플 끄기' : '셔플 켜기'}
			>
				🔀
			</button>
		</div>

		<!-- 플레이리스트 목록 -->
		{#if songs.length === 0 && !isLoading}
			<p>업로드된 음원이 없습니다.</p>
		{:else}
			<ul>
				{#each songs as song, index (song.id)}
					<li class:playing={currentListIndex === index}>
						{#if isAdmin}
							<div class="move-controls">
								<button
									type="button"
									class="move-button"
									on:click={() => moveSong(index, 'up')}
									disabled={index === 0 || isLoading || editingSongId}
									aria-label="위로 이동"
								>
									🔼
								</button>
								<button
									type="button"
									class="move-button"
									on:click={() => moveSong(index, 'down')}
									disabled={index === songs.length - 1 || isLoading || editingSongId}
									aria-label="아래로 이동"
								>
									🔽
								</button>
							</div>
						{/if}

						{#if editingSongId === song.id}
							<form class="edit-form" on:submit|preventDefault={() => saveEdit(song.id)}>
								<input
									type="text"
									class="edit-input"
									bind:value={editTitle}
									placeholder="제목"
									required
								/>
								<input
									type="text"
									class="edit-input"
									bind:value={editArtist}
									placeholder="아티스트"
									required
								/>
								<button type="submit" class="edit-button edit-save" disabled={isLoading}>저장</button>
								<button
									type="button"
									class="edit-button edit-cancel"
									on:click={cancelEdit}
									disabled={isLoading}
								>
									취소
								</button>
							</form>
						{:else}
							<button
								type="button"
								class="song-button"
								on:click={() => playSong(song)}
								aria-label="Play {song.title}"
								disabled={editingSongId}
							>
								<div class="song-info">
									<span class="title">{song.title}</span>
									<span class="artist">{song.artist}</span>
									<!-- [신규] 2호점에서만 '기존 곡'인지 표시 (관리자 디버깅용) -->
									{#if isAdmin && currentBranch === 'branch2' && song.isOld}
										<span class="old-tag">(기존 곡)</span>
									{/if}
								</div>
							</button>

							{#if isAdmin}
								<div class="admin-controls">
									<button
										type="button"
										class="edit-button"
										on:click={() => startEdit(song)}
										disabled={isLoading || editingSongId}
										aria-label="Edit {song.title}"
									>
										✏️
									</button>
									<button
										type="button"
										class="delete-button"
										on:click={() => deleteSong(song)}
										disabled={isLoading || editingSongId}
										aria-label="Delete {song.title}"
									>
										&times;
									</button>
								</div>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</main>

<style>
	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
			'Open Sans', 'Helvetica Neue', sans-serif;
		background-color: #121212;
		color: #e0e0e0;
		margin: 0;
		overflow: hidden;
		height: 100vh;
	}
	main {
		max-width: 600px;
		width: 100%;
		padding: 1rem;
		box-sizing: border-box;
		text-align: center;
		height: 100vh;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
	}
	h1 {
		color: #40c9a9;
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
		flex-shrink: 0;
		margin-bottom: 0.5rem;
	}

	/* --- 지점 선택기 --- */
	.branch-selector {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-shrink: 0;
	}
	.branch-selector button {
		background-color: #333;
		color: #aaa;
		border: 2px solid #555;
		border-radius: 20px;
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.2s;
	}
	.branch-selector button:hover:not(:disabled) {
		background-color: #444;
		border-color: #777;
	}
	.branch-selector button.active {
		background-color: #40c9a9;
		color: #121212;
		border-color: #40c9a9;
	}
	.branch-selector button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.card {
		background-color: #1e1e1e;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
		min-height: 50px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		flex-shrink: 0;
	}
	.file-label {
		background-color: #40c9a9;
		color: #121212;
		padding: 0.75rem 1.25rem;
		border-radius: 5px;
		cursor: pointer;
		font-weight: bold;
		transition: background-color 0.2s;
	}
	.file-label:hover {
		background-color: #36ab8f;
	}
	.file-label.disabled {
		background-color: #555;
		cursor: not-allowed;
	}
	.statusMessage {
		display: block;
		margin-top: 1rem;
		color: #a0a0a0;
		font-style: italic;
	}
	.file-label + .statusMessage {
		margin-top: 1rem;
	}
	:not(.file-label) + .statusMessage {
		margin-top: 0;
	}

	/* --- 플레이어 --- */
	.player-wrapper {
		margin-top: 1rem;
		background-color: #2a2a2a;
		padding: 1rem;
		border-radius: 8px;
		flex-shrink: 0;
		margin-bottom: 1rem;
	}

	/* --- 플레이리스트 --- */
	.playlist-wrapper {
		text-align: left;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.playlist-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 2px solid #333;
		padding-bottom: 0.5rem;
		flex-shrink: 0;
	}
	.playlist-header h2 {
		margin: 0;
	}
	.shuffle-button {
		background: none;
		border: 2px solid #555;
		color: #888;
		border-radius: 50px;
		padding: 0.3rem 0.6rem;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}
	.shuffle-button:hover {
		border-color: #40c9a9;
		color: #40c9a9;
	}
	.shuffle-button.active {
		background-color: #40c9a9;
		border-color: #40c9a9;
		color: #121212;
	}

	.playlist-wrapper ul {
		list-style: none;
		padding: 0;
		margin: 0;
		flex-grow: 1;
		overflow-y: auto;
		min-height: 0;
	}
	.playlist-wrapper li {
		border-bottom: 1px solid #2a2a2a;
		display: flex;
		align-items: stretch;
		transition: background-color 0.2s;
	}
	.playlist-wrapper li.playing {
		background-color: #3a5a51;
	}

	/* 이동 버튼 영역 */
	.move-controls {
		display: flex;
		flex-direction: column;
		justify-content: center;
		flex-shrink: 0;
		padding: 0 0.5rem;
	}
	.move-button {
		background: none;
		border: none;
		color: #888;
		cursor: pointer;
		padding: 0.1rem;
		font-size: 0.8rem;
		line-height: 1;
	}
	.move-button:hover {
		color: #fff;
	}
	.move-button:disabled {
		color: #444;
		cursor: not-allowed;
	}

	/* 재생 버튼 */
	.song-button {
		display: block;
		width: 100%;
		padding: 0.75rem;
		background: none;
		border: none;
		cursor: pointer;
		transition: background-color 0.2s;
		text-align: left;
		color: inherit;
		flex-grow: 1;
		padding-left: 0.75rem;
	}
	.move-controls + .song-button {
		padding-left: 0.75rem;
	}
	li:not(:has(.move-controls)) .song-button {
		padding-left: 1.7rem;
	}

	.song-button:hover {
		background-color: #2a2a2a;
	}
	.song-button:disabled {
		cursor: not-allowed;
		background-color: transparent;
	}
	.playlist-wrapper li.playing .song-button:hover {
		background: none;
	}
	.song-info {
		color: #e0e0e0;
	}
	.playlist-wrapper .title {
		display: block;
		font-size: 1.1rem;
		font-weight: bold;
		color: #e0e0e0;
	}
	.playlist-wrapper .artist {
		display: block;
		font-size: 0.9rem;
		color: #a0a0a0;
	}
	/* [신규] 기존 곡 태그 */
	.old-tag {
		display: inline-block;
		font-size: 0.75rem;
		color: #888;
		margin-left: 0.5rem;
		font-style: italic;
	}

	/* --- 수정 폼 스타일 --- */
	.edit-form {
		display: flex;
		flex-grow: 1;
		align-items: center;
		padding: 0.5rem 0.75rem;
		gap: 0.5rem;
	}
	.edit-input {
		flex-grow: 1;
		width: 30%;
		background-color: #333;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
		padding: 0.5rem;
		font-size: 0.9rem;
	}
	.edit-input:focus {
		border-color: #40c9a9;
		outline: none;
	}

	/* --- 관리자 컨트롤 (수정/삭제) --- */
	.admin-controls {
		display: flex;
		align-items: stretch;
		flex-shrink: 0;
	}
	.edit-button {
		background: none;
		border: none;
		color: #888;
		padding: 0 0.75rem;
		cursor: pointer;
		font-size: 1.2rem;
		transition: background-color 0.2s, color 0.2s;
	}
	.edit-button:hover {
		color: #40c9a9;
		background-color: #2a2a2a;
	}
	.edit-button.edit-save {
		font-size: 0.9rem;
		font-weight: bold;
		color: #40c9a9;
	}
	.edit-button.edit-cancel {
		font-size: 0.9rem;
		color: #aaa;
	}
	.edit-button.edit-save:hover {
		background-color: #36ab8f;
		color: #121212;
	}
	.edit-button.edit-cancel:hover {
		background-color: #555;
		color: #fff;
	}
	.edit-button:disabled {
		color: #555;
		cursor: not-allowed;
		background: none;
	}

	/* 삭제 버튼 */
	.delete-button {
		background: none;
		border: none;
		color: #888;
		padding: 0 1.25rem;
		cursor: pointer;
		font-size: 1.5rem;
		font-weight: bold;
		transition: background-color 0.2s, color 0.2s;
		flex-shrink: 0;
	}
	.delete-button:hover {
		background-color: #b04040;
		color: #fff;
	}
	.delete-button:disabled {
		color: #555;
		cursor: not-allowed;
		background: none;
	}
</style>