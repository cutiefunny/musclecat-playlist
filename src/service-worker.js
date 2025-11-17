import { build, files, version } from '$service-worker';

const ASSETS_CACHE = `app-assets-cache-${version}`;
const MUSIC_CACHE = `music-cache-v1`;

const ASSETS = [...build, ...files];

self.addEventListener('install', (event) => {
	async function addFilesToCache() {
		const cache = await caches.open(ASSETS_CACHE);
		await cache.addAll(ASSETS);
	}
	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
	async function deleteOldCaches() {
		const keys = await caches.keys();
		for (const key of keys) {
			if (key !== ASSETS_CACHE && key !== MUSIC_CACHE) {
				await caches.delete(key);
			}
		}
	}
	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event) => {
	// ✅ 1. 'http' 또는 'https' 프로토콜이 아닌 요청은 무시 (chrome-extension 등)
	if (!event.request.url.startsWith('http')) {
		return;
	}

	if (event.request.method !== 'GET') {
		return;
	}

	const url = new URL(event.request.url);

	// A. 오디오 파일 (Firebase Storage) 요청
	if (url.origin === 'https://firebasestorage.googleapis.com') {
		event.respondWith(cacheFirstMusic(event.request));
		return;
	}

	// B. 그 외 앱 파일 요청
	event.respondWith(cacheFirstAssets(event.request));
});

async function cacheFirstAssets(request) {
	const cache = await caches.open(ASSETS_CACHE);
	const cachedResponse = await cache.match(request);
	if (cachedResponse) {
		return cachedResponse;
	}
	try {
		const response = await fetch(request);
		return response;
	} catch (e) {
		console.warn('Fetch failed; network error.', e);
		return new Response('Network error occurred.', { status: 408 });
	}
}

async function cacheFirstMusic(request) {
	const cache = await caches.open(MUSIC_CACHE);
	const cachedResponse = await cache.match(request);

	if (cachedResponse) {
		console.log('Serving from MUSIC_CACHE:', request.url);
		return cachedResponse;
	}

	console.log('Fetching from network and caching:', request.url);
	try {
		const response = await fetch(request);
		if (response.ok) {
			await cache.put(request, response.clone());
		}
		return response;
	} catch (e) {
		console.warn('Music fetch failed; network error.', e);
		return new Response('Network error occurred.', { status: 408 });
	}
}