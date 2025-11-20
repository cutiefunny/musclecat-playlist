import { build, files, version } from '$service-worker';

const ASSETS_CACHE = `app-assets-cache-${version}`;

// ASSETS: 앱 실행에 필수적인 정적 파일들 (HTML, JS, CSS, 아이콘 등)
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
			// 앱 자산 캐시가 아닌 것은 모두 삭제 (이전 버전 정리)
			if (key !== ASSETS_CACHE) {
				await caches.delete(key);
			}
		}
	}
	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event) => {
	// 1. 'http' 또는 'https' 프로토콜이 아닌 요청은 무시 (chrome-extension 등)
	if (!event.request.url.startsWith('http')) {
		return;
	}

	// 2. GET 요청만 처리
	if (event.request.method !== 'GET') {
		return;
	}

	// [변경] 음원 요청(Firebase Storage)은 Service Worker가 캐싱하지 않음 (IndexedDB가 처리)
	// 모든 요청에 대해 앱 자산 캐시 우선 확인 -> 없으면 네트워크 요청 (Network Fallback)
	event.respondWith(cacheFirstAssets(event.request));
});

async function cacheFirstAssets(request) {
	const cache = await caches.open(ASSETS_CACHE);
	const cachedResponse = await cache.match(request);

	// 1. 캐시에 있으면 반환
	if (cachedResponse) {
		return cachedResponse;
	}

	// 2. 없으면 네트워크로 요청 (캐시에 저장하지 않고 그대로 반환)
	try {
		const response = await fetch(request);
		return response;
	} catch (e) {
		console.warn('Fetch failed; network error.', e);
		return new Response('Network error occurred.', { status: 408 });
	}
}