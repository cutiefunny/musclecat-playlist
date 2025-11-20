// src/lib/cache.js
const DB_NAME = 'MusicPlayerDB';
const STORE_NAME = 'songs';
const DB_VERSION = 1;

// DB 열기 (Promise)
function openDB() {
	return new Promise((resolve, reject) => {
		if (!('indexedDB' in window)) {
			reject('IndexedDB not supported');
			return;
		}
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = (event) => {
			const db = event.target.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME); // Key는 song ID 사용
			}
		};

		request.onsuccess = (event) => resolve(event.target.result);
		request.onerror = (event) => reject(event.target.error);
	});
}

// [신규] 캐시된 모든 곡의 ID 목록 가져오기
export async function getCachedSongIds() {
	try {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, 'readonly');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.getAllKeys(); // 모든 키(ID)만 빠르게 조회

			request.onsuccess = () => resolve(request.result || []);
			request.onerror = () => reject(request.error);
		});
	} catch (e) {
		console.error('Cache keys read error:', e);
		return [];
	}
}

// 음원 파일(Blob) 가져오기
export async function getCachedAudio(songId) {
	try {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, 'readonly');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(songId);

			request.onsuccess = () => resolve(request.result); // Blob or undefined
			request.onerror = () => reject(request.error);
		});
	} catch (e) {
		console.error('Cache read error:', e);
		return null;
	}
}

// 음원 파일(Blob) 저장하기
export async function cacheAudio(songId, blob) {
	try {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put(blob, songId);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} catch (e) {
		console.error('Cache write error:', e);
	}
}

// [신규] 캐시된 음원 삭제하기
export async function removeCachedAudio(songId) {
	try {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.delete(songId);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} catch (e) {
		console.error('Cache delete error:', e);
	}
}