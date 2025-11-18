// src/lib/store.js
import { writable, derived } from 'svelte/store';
import {
	db,
	storage,
	auth,
	onAuthStateChanged,
	login,
	logout
} from '$lib/firebase.js';
import {
	ref,
	uploadBytes,
	getDownloadURL,
	deleteObject
} from 'firebase/storage';
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

// --- 1. 상태 변수 (Writables) ---
export const isLoading = writable(false);
export const statusMessage = writable('플레이리스트 로딩 중...');

// 인증 상태
export const currentUser = writable(null);
const ADMIN_EMAIL = 'cutiefunny@gmail.com';
export const isAdmin = derived(
	currentUser,
	($currentUser) => $currentUser?.email === ADMIN_EMAIL
);

// 지점(Branch) 상태
export const currentBranch = writable('branch2');
let unsubscribeFirestore = () => {};

// 목록 상태
export const songs = writable([]);
let branchSongsList = []; // 비공개 내부 변수
let oldSongsList = []; // 비공개 내부 변수

// 수정 상태
export const editingSongId = writable(null);
export const editTitle = writable('');
export const editArtist = writable('');

// 재생 상태
export const currentSong = writable(null);
export const isShuffle = writable(false);
export const playQueue = writable([]);
export const currentListIndex = writable(-1);
export const currentQueueIndex = writable(-1);

// --- 2. 내부 헬퍼 함수 (비공개) ---
let _get;
function get(store) {
	if (!_get) {
		let value;
		store.subscribe((v) => (value = v))();
		_get = () => value;
	}
	let value;
	store.subscribe((v) => (value = v))();
	return value;
}

/**
 * 'songs'와 'branchSongs' 목록을 병합하고 정렬하여 메인 'songs' 스토어를 업데이트합니다.
 */
function updateMergedList() {
	const combined = [...branchSongsList, ...oldSongsList];
	combined.sort((a, b) => (a.order || 0) - (b.order || 0));
	songs.set(combined);

	cancelEdit();

	const $currentSong = get(currentSong);
	const $isShuffle = get(isShuffle);
	const $songs = combined;

	if (!$isShuffle) {
		playQueue.set([...$songs]);
		currentQueueIndex.set(
			$currentSong ? $songs.findIndex((s) => s.id === $currentSong.id) : -1
		);
	}
	currentListIndex.set(
		$currentSong ? $songs.findIndex((s) => s.id === $currentSong.id) : -1
	);

	const $isAdmin = get(isAdmin);
	const $currentUser = get(currentUser);
	if ($isAdmin) statusMessage.set('관리자 모드');
	else if ($currentUser) statusMessage.set('감상 모드');
	else statusMessage.set('로그아웃 상태');
}

/**
 * 곡 객체의 isOld 플래그를 기반으로 올바른 Firestore 문서 참조를 반환합니다.
 */
function getSongDocRef(song) {
	if (song.isOld) {
		return doc(db, 'songs', song.id);
	} else {
		const $currentBranch = get(currentBranch);
		return doc(db, 'libraries', $currentBranch, 'songs', song.id);
	}
}

// --- 3. 외부 호출 함수 (공개) ---

/**
 * Firestore 데이터 구독을 초기화합니다.
 */
export function subscribeToBranch(branch) {
	if (!db) return;
	unsubscribeFirestore();

	branchSongsList = [];
	oldSongsList = [];

	if (branch === 'branch1') {
		statusMessage.set('1호점 목록 로딩 중...');
		const q = query(
			collection(db, 'libraries', 'branch1', 'songs'),
			orderBy('order', 'asc')
		);
		const unsubBranchSongs = onSnapshot(
			q,
			(querySnapshot) => {
				branchSongsList = [];
				querySnapshot.forEach((doc) => {
					branchSongsList.push({ id: doc.id, ...doc.data(), isOld: false });
				});
				oldSongsList = [];
				updateMergedList();
			},
			(error) => {
				console.error('Error loading branch 1 songs:', error);
				statusMessage.set('1호점 목록을 불러오는 데 실패했습니다.');
			}
		);
		unsubscribeFirestore = () => unsubBranchSongs();
	} else if (branch === 'branch2') {
		statusMessage.set('2호점 (기존 곡 포함) 목록 로딩 중...');
		const qBranch2 = query(
			collection(db, 'libraries', 'branch2', 'songs'),
			orderBy('order', 'asc')
		);
		const unsubBranchSongs = onSnapshot(
			qBranch2,
			(querySnapshot) => {
				branchSongsList = [];
				querySnapshot.forEach((doc) => {
					branchSongsList.push({ id: doc.id, ...doc.data(), isOld: false });
				});
				updateMergedList();
			},
			(error) => {
				console.error('Error loading branch 2 songs:', error);
				statusMessage.set('2호점 신규 목록 로딩 실패.');
			}
		);

		const qOld = query(collection(db, 'songs'), orderBy('order', 'asc'));
		const unsubOldSongs = onSnapshot(
			qOld,
			(querySnapshot) => {
				oldSongsList = [];
				querySnapshot.forEach((doc) => {
					oldSongsList.push({ id: doc.id, ...doc.data(), isOld: true });
				});
				updateMergedList();
			},
			(error) => {
				console.error('Error loading OLD songs:', error);
				statusMessage.set('2호점 기존 목록 로딩 실패.');
			}
		);
		unsubscribeFirestore = () => {
			unsubBranchSongs();
			unsubOldSongs();
		};
	}
}

/**
 * 지점(Branch) 전환 함수
 */
export function switchBranch(branchId) {
	const $isLoading = get(isLoading);
	const $editingSongId = get(editingSongId);
	const $currentBranch = get(currentBranch);

	if (branchId === $currentBranch || $isLoading || $editingSongId) {
		return;
	}
	currentBranch.set(branchId);
	currentSong.set(null);
	songs.set([]);
	playQueue.set([]);
	currentListIndex.set(-1);
	currentQueueIndex.set(-1);
}

/**
 * 로그인/로그아웃 토글 함수
 */
export async function handleAuthToggle() {
	const $isLoading = get(isLoading);
	const $editingSongId = get(editingSongId);
	const $currentUser = get(currentUser);

	if ($isLoading || $editingSongId) return;

	if ($currentUser) {
		isLoading.set(true);
		statusMessage.set('로그아웃 중...');
		await logout();
		isLoading.set(false);
	} else {
		isLoading.set(true);
		statusMessage.set('Google 계정으로 로그인 중...');
		try {
			await login();
		} catch (error) {
			console.error('Login failed:', error);
			statusMessage.set('로그인에 실패했습니다.');
		} finally {
			isLoading.set(false);
		}
	}
}

/**
 * 파일 업로드 핸들러
 */
export async function handleFileUpload(event) {
	const files = event.target.files;
	if (!files || files.length === 0) return;

	if (!get(isAdmin)) {
		statusMessage.set('업로드 권한이 없습니다.');
		return;
	}

	isLoading.set(true);
	const $currentBranch = get(currentBranch);
	statusMessage.set(
		`${files.length}개 파일 업로드 시작... (${
			$currentBranch === 'branch1' ? '1호점' : '2호점'
		}에 저장)`
	);
	let successCount = 0;
	let errorCount = 0;

	try {
		for (const file of files) {
			const currentFileIndex = successCount + errorCount + 1;
			statusMessage.set(
				`(${currentFileIndex}/${files.length}) '${file.name}' 처리 중...`
			);
			try {
				const fileNameOnly = file.name.replace(/\.[^/.]+$/, '');
				const parts = fileNameOnly.split(' - ');
				const artist = parts[0] || '아티스트 없음';
				const title = parts[1] || fileNameOnly;
				const metadata = { title: title, artist: artist, album: ' ' };

				const storageRef = ref(storage, `music/${Date.now()}_${file.name}`);
				const snapshot = await uploadBytes(storageRef, file);
				const downloadURL = await getDownloadURL(snapshot.ref);

				await addDoc(collection(db, 'libraries', $currentBranch, 'songs'), {
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
		statusMessage.set('배치 업로드 중 심각한 오류 발생.');
	} finally {
		isLoading.set(false);
		statusMessage.set(`업로드 완료: ${successCount}개 성공, ${errorCount}개 실패.`);
		event.target.value = '';
	}
}

/**
 * 곡 순서 변경 (위/아래)
 */
export async function moveSong(currentIndex, direction) {
	if (!get(isAdmin) || get(editingSongId)) return;

	const $songs = get(songs);
	const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
	if (newIndex < 0 || newIndex >= $songs.length) return;

	isLoading.set(true);
	try {
		const songA = $songs[currentIndex];
		const songB = $songs[newIndex];
		const docRefA = getSongDocRef(songA);
		const docRefB = getSongDocRef(songB);
		await updateDoc(docRefA, { order: songB.order });
		await updateDoc(docRefB, { order: songA.order });
	} catch (error) {
		console.error('Failed to update order:', error);
		statusMessage.set('순서 변경에 실패했습니다.');
	} finally {
		isLoading.set(false);
	}
}

// --- 수정 관련 함수 ---
export function startEdit(song) {
	editingSongId.set(song.id);
	editTitle.set(song.title);
	editArtist.set(song.artist);
}

export function cancelEdit() {
	editingSongId.set(null);
	editTitle.set('');
	editArtist.set('');
}

export async function saveEdit(songId) {
	const $editTitle = get(editTitle);
	const $editArtist = get(editArtist);

	if (!get(isAdmin) || !get(editingSongId) || songId !== get(editingSongId)) return;
	if (!$editTitle.trim() || !$editArtist.trim()) {
		statusMessage.set('제목과 아티스트는 비워둘 수 없습니다.');
		return;
	}

	isLoading.set(true);
	statusMessage.set('정보 업데이트 중...');
	try {
		const songToSave = get(songs).find((s) => s.id === songId);
		if (!songToSave) throw new Error('Song not found in list.');

		const docRef = getSongDocRef(songToSave);
		await updateDoc(docRef, {
			title: $editTitle.trim(),
			artist: $editArtist.trim()
		});
		statusMessage.set('업데이트 완료.');
	} catch (error) {
		console.error('Failed to update song info:', error);
		statusMessage.set('업데이트에 실패했습니다.');
	} finally {
		isLoading.set(false);
		cancelEdit();
	}
}

/**
 * 음원 삭제
 */
export async function deleteSong(songToDelete) {
	if (!get(isAdmin) || get(editingSongId)) return;
	if (!songToDelete) return;

	isLoading.set(true);
	statusMessage.set(`'${songToDelete.title}' 삭제 중...`);
	try {
		const $playQueue = get(playQueue);
		const queueIndex = $playQueue.findIndex((s) => s.id === songToDelete.id);
		if (queueIndex > -1) {
			$playQueue.splice(queueIndex, 1);
			playQueue.set($playQueue);
		}

		if (get(currentSong)?.id === songToDelete.id) {
			currentSong.set(null);
			currentQueueIndex.set(-1);
			currentListIndex.set(-1);
		}

		const docRef = getSongDocRef(songToDelete);
		if (songToDelete.src) {
			const audioRef = ref(storage, songToDelete.src);
			await deleteObject(audioRef);
		}
		await deleteDoc(docRef);
		statusMessage.set(`'${songToDelete.title}' 삭제 완료.`);
	} catch (error) {
		console.error('Error deleting song:', error);
		statusMessage.set('삭제 중 오류가 발생했습니다.');
	} finally {
		isLoading.set(false);
	}
}

// --- 재생 관련 함수 ---
function getShuffledArray(array) {
	const newArr = [...array];
	for (let i = newArr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[newArr[i], newArr[j]] = [newArr[j], newArr[i]];
	}
	return newArr;
}

export function toggleShuffle() {
	const $isShuffle = get(isShuffle);
	const $songs = get(songs);
	const $currentSong = get(currentSong);

	isShuffle.set(!$isShuffle);

	if (!$isShuffle) {
		const otherSongs = $songs.filter((s) => s.id !== $currentSong?.id);
		const shuffledOtherSongs = getShuffledArray(otherSongs);
		playQueue.set(
			$currentSong
				? [$currentSong, ...shuffledOtherSongs]
				: getShuffledArray($songs)
		);
	} else {
		playQueue.set([...$songs]);
	}
	const $playQueue = get(playQueue);
	currentQueueIndex.set(
		$currentSong ? $playQueue.findIndex((s) => s.id === $currentSong.id) : -1
	);
}

export function playSong(song) {
	if (get(editingSongId)) return;
	const $isShuffle = get(isShuffle);
	const $songs = get(songs);
	currentSong.set(song);

	if ($isShuffle) {
		const otherSongs = $songs.filter((s) => s.id !== song.id);
		playQueue.set([song, ...getShuffledArray(otherSongs)]);
		currentQueueIndex.set(0);
	} else {
		playQueue.set([...$songs]);
		currentQueueIndex.set($songs.findIndex((s) => s.id === song.id));
	}
	currentListIndex.set($songs.findIndex((s) => s.id === song.id));
}

export function playNext() {
	const $playQueue = get(playQueue);
	if ($playQueue.length === 0) return;
	let nextIndex = get(currentQueueIndex) + 1;
	if (nextIndex >= $playQueue.length) {
		nextIndex = 0;
	}
	currentQueueIndex.set(nextIndex);
	const nextSong = $playQueue[nextIndex];
	currentSong.set(nextSong);
	currentListIndex.set(get(songs).findIndex((s) => s.id === nextSong.id));
}

export function playPrevious() {
	const $playQueue = get(playQueue);
	if ($playQueue.length === 0) return;
	let prevIndex = get(currentQueueIndex) - 1;
	if (prevIndex < 0) {
		prevIndex = $playQueue.length - 1;
	}
	currentQueueIndex.set(prevIndex);
	const prevSong = $playQueue[prevIndex];
	currentSong.set(prevSong);
	currentListIndex.set(get(songs).findIndex((s) => s.id === prevSong.id));
}

// --- 4. 스토어 초기화 로직 (Auth 감지) ---
export function init() {
	const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
		currentUser.set(user);
		if (!get(isAdmin)) {
			cancelEdit();
		}
	});
	// Note: We don't return unsubscribeAuth here as the store lives forever.
}