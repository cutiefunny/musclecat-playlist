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
	setDoc,
	orderBy
} from 'firebase/firestore';
import {
	getCachedAudio,
	cacheAudio,
	getCachedSongIds,
	removeCachedAudio
} from '$lib/cache.js';

const ADMIN_EMAIL = 'cutiefunny@gmail.com';
const DEVICE_MODE_KEY = 'musclecat_device_mode';

class MusicState {
	// --- 1. 상태 변수 ($state) ---
	isLoading = $state(false);
	statusMessage = $state('초기화 중...');

	// 인증 상태
	currentUser = $state(null);
	isAdmin = $derived(this.currentUser?.email === ADMIN_EMAIL);

	// 지점(Branch) & 디바이스 모드 상태
	// [수정] 초기값을 null로 하여 최초 설정 시 반드시 구독이 트리거되도록 함
	currentBranch = $state(null); 
	
	// deviceMode: null(미설정), 'general'(일반), 'branch1'/'branch2'(고정)
	deviceMode = $state(null);
	_unsubscribeFirestore = () => {};

	// 목록 상태
	songs = $state([]);
	_branchSongsList = [];
	_oldSongsList = [];

	// 수정 상태
	editingSongId = $state(null);
	editTitle = $state('');
	editArtist = $state('');

	// 재생 상태
	currentSong = $state(null);
	isShuffle = $state(false);
	repeatMode = $state(1);
	playQueue = $state([]);
	currentListIndex = $state(-1);
	currentQueueIndex = $state(-1);
	isPlaying = $state(false);

	// 모니터링 상태
	monitoringStatus = $state({
		branch1: null,
		branch2: null
	});
	_unsubscribeMonitoring = () => {};

	// 캐시 상태
	cachedSongIds = $state(new Set());
	_activeBlobUrl = null;

	constructor() {}

	// --- 2. 초기화 및 기기 설정 ---
	init() {
		onAuthStateChanged(auth, (user) => {
			this.currentUser = user;
			if (!this.isAdmin) this.cancelEdit();
			this._updateStatusMessage();
		});

		this._syncCacheStatus();

		if (typeof window !== 'undefined') {
			const savedMode = localStorage.getItem(DEVICE_MODE_KEY);
			if (savedMode) {
				this.setDeviceMode(savedMode, false);
			} else {
				this.statusMessage = '기기 설정이 필요합니다.';
				// 모드가 없으면 기본적으로 2호점(기본값)을 보여줄 수도 있지만,
				// 여기선 DeviceSetup 화면을 위해 아무것도 로드하지 않음
			}
		}
	}

	setDeviceMode(mode, save = true) {
		this.deviceMode = mode;

		if (save && typeof window !== 'undefined') {
			localStorage.setItem(DEVICE_MODE_KEY, mode);
		}

		if (mode === 'branch1' || mode === 'branch2') {
			console.log(`[Device] ${mode} 고정 모드 진입`);
			// [중요] 강제로 해당 지점 로드 (currentBranch가 null이므로 실행됨)
			this.switchBranch(mode); 
		} else {
			console.log('[Device] 일반 모드 진입');
			// 일반 모드 기본값: 2호점 (또는 이전에 보던 곳)
			if (!this.currentBranch) {
				this.switchBranch('branch2');
			}
		}
		this._updateStatusMessage();
	}

	resetDeviceMode() {
		this.deviceMode = null;
		if (typeof window !== 'undefined') {
			localStorage.removeItem(DEVICE_MODE_KEY);
		}
		this.statusMessage = '기기 설정이 초기화되었습니다.';
		
		// 리소스 정리
		this._cleanupResources();
		this._unsubscribeFirestore();
		this.currentBranch = null; // 지점 상태도 초기화
	}

	_cleanupResources() {
		if (this._activeBlobUrl) {
			URL.revokeObjectURL(this._activeBlobUrl);
			this._activeBlobUrl = null;
		}
		this.currentSong = null;
		this.isPlaying = false;
		this.songs = [];
		this.playQueue = [];
		this.currentListIndex = -1;
		this.currentQueueIndex = -1;
	}

	async handleAuthToggle() {
		if (this.isLoading || this.editingSongId) return;

		if (this.currentUser) {
			this.isLoading = true;
			this.statusMessage = '로그아웃 중...';
			await logout();
			this.isLoading = false;
		} else {
			this.isLoading = true;
			this.statusMessage = 'Google 계정으로 로그인 중...';
			try {
				await login();
			} catch (error) {
				console.error('Login failed:', error);
				this.statusMessage = '로그인 실패';
			} finally {
				this.isLoading = false;
			}
		}
	}

	_updateStatusMessage() {
		if (!this.deviceMode) this.statusMessage = '기기 설정 필요';
		else if (this.deviceMode === 'branch1') this.statusMessage = '1호점 플레이어';
		else if (this.deviceMode === 'branch2') this.statusMessage = '2호점 플레이어';
		else if (this.isAdmin) this.statusMessage = '관리자 모드';
		else if (this.currentUser) this.statusMessage = '감상 모드';
		else this.statusMessage = '로그아웃 상태';
	}

	// --- 3. 데이터 로딩 (Firestore 구독) ---
	subscribeToBranch(branch) {
		if (!db) return;
		this._unsubscribeFirestore(); // 기존 구독 해제

		this._branchSongsList = [];
		this._oldSongsList = [];

		if (branch === 'branch1') {
			this.statusMessage = '1호점 목록 로딩 중...';
			const q = query(
				collection(db, 'libraries', 'branch1', 'songs'),
				orderBy('order', 'asc')
			);
			const unsub = onSnapshot(q, (snapshot) => {
				this._branchSongsList = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
					isOld: false
				}));
				this._oldSongsList = [];
				this._updateMergedList();
			});
			this._unsubscribeFirestore = () => unsub();
		} else if (branch === 'branch2') {
			this.statusMessage = '2호점 목록 로딩 중...';
			const qBranch2 = query(
				collection(db, 'libraries', 'branch2', 'songs'),
				orderBy('order', 'asc')
			);
			const unsubBranch2 = onSnapshot(qBranch2, (snapshot) => {
				this._branchSongsList = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
					isOld: false
				}));
				this._updateMergedList();
			});

			const qOld = query(collection(db, 'songs'), orderBy('order', 'asc'));
			const unsubOld = onSnapshot(qOld, (snapshot) => {
				this._oldSongsList = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
					isOld: true
				}));
				this._updateMergedList();
			});

			this._unsubscribeFirestore = () => {
				unsubBranch2();
				unsubOld();
			};
		}
	}

	_updateMergedList() {
		const combined = [...this._branchSongsList, ...this._oldSongsList];
		combined.sort((a, b) => (a.order || 0) - (b.order || 0));
		this.songs = combined;

		this.cancelEdit();

		if (!this.isShuffle) {
			this.playQueue = [...this.songs];
			this.currentQueueIndex = this.currentSong
				? this.songs.findIndex((s) => s.id === this.currentSong.id)
				: -1;
		}
		this.currentListIndex = this.currentSong
			? this.songs.findIndex((s) => s.id === this.currentSong.id)
			: -1;

		this._updateStatusMessage();
	}

	switchBranch(branchId) {
		// 고정 기기 모드 방어 코드
		if (
			(this.deviceMode === 'branch1' || this.deviceMode === 'branch2') &&
			this.deviceMode !== branchId
		) {
			console.warn('고정 기기 모드에서는 지점을 변경할 수 없습니다.');
			return;
		}

		// [수정] 이미 같은 지점이어도 로딩이 안 된 상태(songs가 비어있음)라면 다시 구독 시도
		if (
			branchId === this.currentBranch &&
			!this.isLoading &&
			this.songs.length > 0
		) {
			return;
		}

		this.currentBranch = branchId;
		this._cleanupResources(); // 리소스 정리
		
		this.subscribeToBranch(branchId);
	}

	// --- 4. 관리자 모니터링 ---
	subscribeToAllDeviceStatuses() {
		if (this._unsubscribeMonitoring) this._unsubscribeMonitoring();
		if (!db) return;

		const unsub1 = onSnapshot(
			doc(db, 'libraries', 'branch1', 'status', 'nowPlaying'),
			(doc) => (this.monitoringStatus.branch1 = doc.data() || null)
		);
		const unsub2 = onSnapshot(
			doc(db, 'libraries', 'branch2', 'status', 'nowPlaying'),
			(doc) => (this.monitoringStatus.branch2 = doc.data() || null)
		);

		this._unsubscribeMonitoring = () => {
			unsub1();
			unsub2();
		};
	}

	// --- 5. 재생 및 동기화 ---
	async _syncPlaybackStatus() {
		if (this.deviceMode !== 'branch1' && this.deviceMode !== 'branch2') return;
		if (!db) return;

		const statusRef = doc(db, 'libraries', this.deviceMode, 'status', 'nowPlaying');
		const data = {
			isPlaying: this.isPlaying,
			updatedAt: serverTimestamp(),
			currentSong: this.currentSong
				? {
						id: this.currentSong.id,
						title: this.currentSong.title,
						artist: this.currentSong.artist,
						isOld: !!this.currentSong.isOld
				  }
				: null
		};
		try {
			await setDoc(statusRef, data);
		} catch (e) {
			console.error('[Sync] Failed:', e);
		}
	}

	setPlaybackState(isPlaying) {
		if (this.isPlaying !== isPlaying) {
			this.isPlaying = isPlaying;
			this._syncPlaybackStatus();
		}
	}

	async loadAndPlaySong(song) {
		if (!song) return;
		if (this._activeBlobUrl) {
			URL.revokeObjectURL(this._activeBlobUrl);
			this._activeBlobUrl = null;
		}

		const cachedBlob = await getCachedAudio(song.id);
		let playSrc = song.src;
		let isCached = false;

		if (cachedBlob) {
			this._activeBlobUrl = URL.createObjectURL(cachedBlob);
			playSrc = this._activeBlobUrl;
			isCached = true;
		} else {
			this._downloadToCache(song);
		}

		this.currentSong = { ...song, src: playSrc, _isLocal: isCached };
	}

	async _downloadToCache(song) {
		try {
			const response = await fetch(song.src);
			if (!response.ok) throw new Error('Network error');
			const blob = await response.blob();
			await cacheAudio(song.id, blob);
			this.cachedSongIds = new Set(this.cachedSongIds).add(song.id);
		} catch (e) {
			console.error(`Download failed: ${song.title}`, e);
		}
	}

	async _syncCacheStatus() {
		const ids = await getCachedSongIds();
		this.cachedSongIds = new Set(ids);
	}

	toggleShuffle() {
		this.isShuffle = !this.isShuffle;
		if (!this.isShuffle) {
			this.playQueue = [...this.songs];
		} else {
			const otherSongs = this.songs.filter((s) => s.id !== this.currentSong?.id);
			this.playQueue = this.currentSong
				? [this.currentSong, ...this._getShuffledArray(otherSongs)]
				: this._getShuffledArray(this.songs);
		}
		this.currentQueueIndex = this.currentSong
			? this.playQueue.findIndex((s) => s.id === this.currentSong.id)
			: -1;
	}

	_getShuffledArray(array) {
		const newArr = [...array];
		for (let i = newArr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[newArr[i], newArr[j]] = [newArr[j], newArr[i]];
		}
		return newArr;
	}

	playSong(song) {
		if (this.editingSongId) return;
		this.loadAndPlaySong(song);

		if (this.isShuffle) {
			const otherSongs = this.songs.filter((s) => s.id !== song.id);
			this.playQueue = [song, ...this._getShuffledArray(otherSongs)];
			this.currentQueueIndex = 0;
		} else {
			this.playQueue = [...this.songs];
			this.currentQueueIndex = this.songs.findIndex((s) => s.id === song.id);
		}
		this.currentListIndex = this.songs.findIndex((s) => s.id === song.id);
	}

	playNext() {
		if (this.playQueue.length === 0) return;
		let nextIndex = this.currentQueueIndex + 1;
		if (nextIndex >= this.playQueue.length) nextIndex = 0;
		this.currentQueueIndex = nextIndex;
		const nextSong = this.playQueue[nextIndex];
		this.loadAndPlaySong(nextSong);
		this.currentListIndex = this.songs.findIndex((s) => s.id === nextSong.id);
	}

	playPrevious() {
		if (this.playQueue.length === 0) return;
		let prevIndex = this.currentQueueIndex - 1;
		if (prevIndex < 0) prevIndex = this.playQueue.length - 1;
		this.currentQueueIndex = prevIndex;
		const prevSong = this.playQueue[prevIndex];
		this.loadAndPlaySong(prevSong);
		this.currentListIndex = this.songs.findIndex((s) => s.id === prevSong.id);
	}

	// --- 6. 관리자 기능 (CRUD) ---
	async handleFileUpload(files) {
		if (!files || files.length === 0) return;
		if (!this.isAdmin) return;
		this.isLoading = true;
		this.statusMessage = `${files.length}개 업로드 시작...`;
		let success = 0, fail = 0;

		try {
			for (const file of files) {
				const idx = success + fail + 1;
				this.statusMessage = `(${idx}/${files.length}) '${file.name}' 처리 중...`;
				try {
					const nameBase = file.name.replace(/\.[^/.]+$/, '');
					const parts = nameBase.split(' - ');
					const artist = parts[0] || 'Unknown';
					const title = parts[1] || nameBase;

					const storageRef = ref(storage, `music/${Date.now()}_${file.name}`);
					const snapshot = await uploadBytes(storageRef, file);
					const url = await getDownloadURL(snapshot.ref);

					await addDoc(
						collection(db, 'libraries', this.currentBranch, 'songs'),
						{
							title,
							artist,
							album: ' ',
							src: url,
							fileName: file.name,
							createdAt: serverTimestamp(),
							order: Date.now()
						}
					);
					success++;
				} catch (e) {
					console.error('Upload failed:', e);
					fail++;
				}
			}
		} finally {
			this.isLoading = false;
			this.statusMessage = `완료: 성공 ${success}, 실패 ${fail}`;
		}
	}

	startEdit(song) {
		this.editingSongId = song.id;
		this.editTitle = song.title;
		this.editArtist = song.artist;
	}

	cancelEdit() {
		this.editingSongId = null;
		this.editTitle = '';
		this.editArtist = '';
	}

	async saveEdit(songId) {
		if (!this.isAdmin || songId !== this.editingSongId) return;
		this.isLoading = true;
		try {
			const song = this.songs.find((s) => s.id === songId);
			if (!song) throw new Error('Song not found');
			const ref = this._getSongDocRef(song);
			await updateDoc(ref, {
				title: this.editTitle.trim(),
				artist: this.editArtist.trim()
			});
			this.statusMessage = '수정 완료';
		} catch (e) {
			console.error('Edit failed:', e);
			this.statusMessage = '수정 실패';
		} finally {
			this.isLoading = false;
			this.cancelEdit();
		}
	}

	async moveSong(index, direction) {
		if (!this.isAdmin || this.editingSongId) return;
		const targetIndex = direction === 'up' ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= this.songs.length) return;
		this.isLoading = true;
		try {
			const songA = this.songs[index];
			const songB = this.songs[targetIndex];
			const refA = this._getSongDocRef(songA);
			const refB = this._getSongDocRef(songB);
			await updateDoc(refA, { order: songB.order });
			await updateDoc(refB, { order: songA.order });
		} catch (e) {
			console.error('Move failed:', e);
		} finally {
			this.isLoading = false;
		}
	}

	async deleteSong(song) {
		if (!this.isAdmin || this.editingSongId) return;
		this.isLoading = true;
		try {
			if (this.currentSong?.id === song.id) {
				if (this._activeBlobUrl) {
					URL.revokeObjectURL(this._activeBlobUrl);
					this._activeBlobUrl = null;
				}
				this.currentSong = null;
				this.isPlaying = false;
				this._syncPlaybackStatus();
			}
			this.playQueue = this.playQueue.filter((s) => s.id !== song.id);

			if (song.src) {
				try {
					await deleteObject(ref(storage, song.src));
				} catch (e) {}
			}
			await deleteDoc(this._getSongDocRef(song));

			await removeCachedAudio(song.id);
			const nextCache = new Set(this.cachedSongIds);
			nextCache.delete(song.id);
			this.cachedSongIds = nextCache;
			this.statusMessage = '삭제 완료';
		} catch (e) {
			console.error('Delete failed:', e);
		} finally {
			this.isLoading = false;
		}
	}

	_getSongDocRef(song) {
		if (song.isOld) return doc(db, 'songs', song.id);
		return doc(db, 'libraries', this.currentBranch, 'songs', song.id);
	}
}

export const musicState = new MusicState();