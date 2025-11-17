<script>
	import { onMount } from 'svelte';
	// Firebase 설정 파일 가져오기
	import { db, storage } from '$lib/firebase.js';

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
	let statusMessage = '업로드할 음원을 선택하세요.';

	let isShuffle = false;
	let playQueue = [];
	let currentListIndex = -1;
	let currentQueueIndex = -1;

	// --- 1. Firestore에서 노래 목록 실시간 로드 ---
	onMount(() => {
		const q = query(collection(db, 'songs'), orderBy('order', 'asc'));

		const unsubscribe = onSnapshot(
			q,
			(querySnapshot) => {
				const songList = [];
				querySnapshot.forEach((doc) => {
					songList.push({ id: doc.id, ...doc.data() });
				});
				songs = songList;

				if (!isShuffle) {
					playQueue = [...songs];
					currentQueueIndex = currentSong ? playQueue.findIndex((s) => s.id === currentSong.id) : -1;
				}
				currentListIndex = currentSong ? songs.findIndex((s) => s.id === currentSong.id) : -1;
			},
			(error) => {
				console.error('Error loading songs:', error);
				statusMessage = '노래 목록을 불러오는 데 실패했습니다.';
			}
		);
		return () => unsubscribe();
	});

	// --- ✅ 2. 파일 업로드 및 Firestore 저장 (다중 파일 처리로 수정) ---
	async function handleFileUpload(event) {
		const files = event.target.files; // 단일 'file'이 아닌 'files' (FileList)
		if (!files || files.length === 0) {
			return; // 선택된 파일 없음
		}

		isLoading = true;
		statusMessage = `${files.length}개 파일 업로드 시작...`;
		let successCount = 0;
		let errorCount = 0;

		try {
			// for...of 루프를 사용하여 파일 목록을 순차적으로 처리 (forEach는 await와 함께 사용 불가)
			for (const file of files) {
				const currentFileIndex = successCount + errorCount + 1;
				statusMessage = `(${currentFileIndex}/${files.length}) '${file.name}' 처리 중...`;

				// 개별 파일 업로드 로직 (개별 오류 처리를 위해 try...catch로 감쌈)
				try {
					const fileNameOnly = file.name.replace(/\.[^/.]+$/, '');
					const parts = fileNameOnly.split(' - ');
					const artist = parts[0] || '아티스트 없음';
					const title = parts[1] || fileNameOnly;
					const metadata = { title: title, artist: artist, album: ' ' };

					const storageRef = ref(storage, `music/${Date.now()}_${file.name}`);
					const snapshot = await uploadBytes(storageRef, file);
					const downloadURL = await getDownloadURL(snapshot.ref);

					await addDoc(collection(db, 'songs'), {
						...metadata,
						src: downloadURL,
						fileName: file.name,
						createdAt: serverTimestamp(),
						order: Date.now() // 순차적으로 order 값 부여
					});

					successCount++;
				} catch (fileError) {
					console.error(`'${file.name}' 업로드 실패:`, fileError);
					errorCount++;
				}
			}
		} catch (batchError) {
			// 루프 자체의 오류 (드물지만 방어 코드)
			console.error('배치 업로드 중 예기치 않은 오류:', batchError);
			statusMessage = '배치 업로드 중 심각한 오류 발생.';
		} finally {
			// 모든 파일 처리 완료 후
			isLoading = false;
			statusMessage = `업로드 완료: ${successCount}개 성공, ${errorCount}개 실패.`;
			event.target.value = ''; // input 초기화
		}
	}

	// --- 3. 순서 변경 함수 ---
	async function moveSong(currentIndex, direction) {
		const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
		if (newIndex < 0 || newIndex >= songs.length) return;
		isLoading = true;
		try {
			const songA = songs[currentIndex];
			const songB = songs[newIndex];
			const docRefA = doc(db, 'songs', songA.id);
			const docRefB = doc(db, 'songs', songB.id);
			await updateDoc(docRefA, { order: songB.order });
			await updateDoc(docRefB, { order: songA.order });
		} catch (error) {
			console.error('Failed to update order:', error);
			statusMessage = '순서 변경에 실패했습니다.';
		} finally {
			isLoading = false;
		}
	}

	// --- 4. 셔플 배열 생성 (Fisher-Yates) ---
	function getShuffledArray(array) {
		const newArr = [...array];
		for (let i = newArr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[newArr[i], newArr[j]] = [newArr[j], newArr[i]];
		}
		return newArr;
	}

	// --- 5. 셔플 토글 함수 ---
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

	// --- 6. 노래 재생 ---
	function playSong(song) {
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

	// --- 7. 다음 곡/이전 곡 ---
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

	// --- 8. Media Session API 설정 ---
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

	// --- 9. 음원 삭제 기능 ---
	async function deleteSong(songToDelete) {
		if (!songToDelete) return;
		if (!confirm(`'${songToDelete.title}' 음원을 삭제하시겠습니까?`)) {
			return;
		}
		isLoading = true;
		statusMessage = `'${songToDelete.title}' 삭제 중...`;
		try {
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
			const docRef = doc(db, 'songs', songToDelete.id);
			if (songToDelete.src) {
				const audioRef = ref(storage, songToDelete.src);
				await deleteObject(audioRef);
			}
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
	<h1>🎵 SvelteKit 뮤직 플레이어</h1>

	<div class="card">
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
		<span class="statusMessage">{statusMessage}</span>
	</div>

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
					<p>お使いのブラウザは audio 要素をサポートしていません。</p>
				</audio>
			</div>
		</div>
	{/if}

	<div class="playlist-wrapper">
		<div class="playlist-header">
			<h2>내 라이브러리</h2>
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

		{#if songs.length === 0 && !isLoading}
			<p>업로드된 음원이 없습니다.</p>
		{:else}
			<ul>
				{#each songs as song, index (song.id)}
					<li class:playing={currentListIndex === index}>
						<div class="move-controls">
							<button
								type="button"
								class="move-button"
								on:click={() => moveSong(index, 'up')}
								disabled={index === 0 || isLoading}
								aria-label="위로 이동"
							>
								🔼
							</button>
							<button
								type="button"
								class="move-button"
								on:click={() => moveSong(index, 'down')}
								disabled={index === songs.length - 1 || isLoading}
								aria-label="아래로 이동"
							>
								🔽
							</button>
						</div>

						<button
							type="button"
							class="song-button"
							on:click={() => playSong(song)}
							aria-label="Play {song.title}"
						>
							<div class="song-info">
								<span class="title">{song.title}</span>
								<span class="artist">{song.artist}</span>
							</div>
						</button>
						<button
							type="button"
							class="delete-button"
							on:click={() => deleteSong(song)}
							disabled={isLoading}
							aria-label="Delete {song.title}"
						>
							&times;
						</button>
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
		display: grid;
		place-items: center;
		min-height: 100vh;
		margin: 0;
	}
	main {
		max-width: 600px;
		width: 100%;
		padding: 1rem;
		box-sizing: border-box;
		text-align: center;
	}
	h1 {
		color: #40c9a9;
	}
	.card {
		background-color: #1e1e1e;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
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

	/* --- 플레이어 --- */
	.player-wrapper {
		margin-top: 1rem;
		background-color: #2a2a2a;
		padding: 1rem;
		border-radius: 8px;
	}
	.player-info {
		width: 100%;
		text-align: left;
	}
	.now-playing {
		margin: 0 0 0.5rem 0;
	}
	.now-playing strong {
		color: #40c9a9;
		display: block;
		font-size: 1.1rem;
	}
	.now-playing span {
		font-size: 0.9rem;
		color: #aaa;
	}
	audio {
		width: 100%;
		border-radius: 5px;
	}

	/* --- 플레이리스트 --- */
	.playlist-wrapper {
		margin-top: 2rem;
		text-align: left;
	}
	.playlist-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 2px solid #333;
		padding-bottom: 0.5rem;
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
		max-height: 40vh;
		overflow-y: auto;
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
	}
	.song-button:hover {
		background-color: #2a2a2a;
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