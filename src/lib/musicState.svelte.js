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
	// ... (기존 변수 유지)
	isLoading = $state(false);
	statusMessage = $state('초기화 중...');
	currentUser = $state(null);
	isAdmin = $derived(this.currentUser?.email === ADMIN_EMAIL);
	currentBranch = $state(null);
	deviceMode = $state(null);
	_unsubscribeFirestore = () => {};
	songs = $state([]);
	_branchSongsList = [];
	_oldSongsList = [];
	editingSongId = $state(null);
	editTitle = $state('');
	editArtist = $state('');
	
	currentSong = $state(null);
	isShuffle = $state(false);
	repeatMode = $state(1);
	playQueue = $state([]);
	currentListIndex = $state(-1);
	currentQueueIndex = $state(-1);
	isPlaying = $state(false);

	monitoringStatus = $state({ branch1: null, branch2: null });
	_unsubscribeMonitoring = () => {};

	_unsubscribeCommands = () => {};
	_lastCommandTime = Date.now();
	
	// [신규] 명령 이벤트 시그널 (상태가 같아도 명령을 수행하기 위함)
	lastCommandEvent = $state(null); // { type: 'play', timestamp: 12345 }

	cachedSongIds = $state(new Set());
	_activeBlobUrl = null;

	constructor() {}

	init() {
		onAuthStateChanged(auth, (user) => {
			this.currentUser = user;
			if (!this.isAdmin) this.cancelEdit();
			this._updateStatusMessage();
		});
		this._syncCacheStatus();
		if (typeof window !== 'undefined') {
			window.addEventListener('beforeunload', () => {
				if (this.deviceMode === 'branch1' || this.deviceMode === 'branch2') {
					this.resetDeviceMode(); 
				}
			});
			const savedMode = localStorage.getItem(DEVICE_MODE_KEY);
			if (savedMode) this.setDeviceMode(savedMode, false);
			else this.statusMessage = '기기 설정이 필요합니다.';
		}
	}

	setDeviceMode(mode, save = true) {
		this.deviceMode = mode;
		if (save && typeof window !== 'undefined') localStorage.setItem(DEVICE_MODE_KEY, mode);

		if (mode === 'branch1' || mode === 'branch2') {
			console.log(`[Device] ${mode} 고정 모드 시작`);
			this.switchBranch(mode);
			this._subscribeToCommands();
		} else {
			console.log('[Device] 일반 모드 진입');
			if (!this.currentBranch) this.switchBranch('branch2');
		}
		this._updateStatusMessage();
	}

	_subscribeToCommands() {
		if (this._unsubscribeCommands) this._unsubscribeCommands();
		if (!db || !this.deviceMode) return;

		const cmdRef = doc(db, 'libraries', this.deviceMode, 'status', 'commands');
		this._unsubscribeCommands = onSnapshot(cmdRef, (snapshot) => {
			const data = snapshot.data();
			if (!data) return;
			// 중복 실행 방지
			if (data.timestamp > this._lastCommandTime) {
				this._lastCommandTime = data.timestamp;
				this._executeCommand(data);
			}
		});
	}

	_executeCommand(cmd) {
		console.log('[Command Received]', cmd);
		
		// [핵심] 명령 이벤트를 갱신하여 AudioPlayer가 항상 반응하도록 함
		// (play/pause 로직은 AudioPlayer의 effect에서 처리)
		this.lastCommandEvent = { ...cmd }; 

		// 로직이 필요한 명령은 여기서 처리
		if (cmd.type === 'next') this.playNext();
		if (cmd.type === 'prev') this.playPrevious();
		if (cmd.type === 'toggleShuffle') this.toggleShuffle();
		if (cmd.type === 'setRepeat') this.repeatMode = cmd.payload;
	}

	async sendRemoteCommand(targetBranch, type, payload = null) {
		if (!this.isAdmin || !db) return;
		try {
			await setDoc(doc(db, 'libraries', targetBranch, 'status', 'commands'), {
				type,
				payload,
				timestamp: Date.now()
			});
			console.log(`[Admin] Sent '${type}' to ${targetBranch}`);
		} catch (e) {
			console.error('[Admin] Command failed:', e);
		}
	}

    // ... (resetDeviceMode, cleanup, handleAuthToggle, updateStatus 등 기존 로직 동일)
    
	async resetDeviceMode() {
		const targetBranch = this.deviceMode;
		if ((targetBranch === 'branch1' || targetBranch === 'branch2') && db) {
			try { await deleteDoc(doc(db, 'libraries', targetBranch, 'status', 'nowPlaying')); } catch (e) {}
		}
		this.deviceMode = null;
		if (typeof window !== 'undefined') localStorage.removeItem(DEVICE_MODE_KEY);
		this.statusMessage = '기기 설정이 초기화되었습니다.';
		this._cleanupResources();
		this._unsubscribeFirestore();
		if (this._unsubscribeCommands) this._unsubscribeCommands();
		this.currentBranch = null;
	}

	_cleanupResources() {
		if (this._activeBlobUrl) { URL.revokeObjectURL(this._activeBlobUrl); this._activeBlobUrl = null; }
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
			try { await login(); } catch (error) { console.error('Login failed:', error); this.statusMessage = '로그인 실패'; } finally { this.isLoading = false; }
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

	subscribeToBranch(branch) {
		if (!db) return;
		this._unsubscribeFirestore();
		this._branchSongsList = [];
		this._oldSongsList = [];
		if (branch === 'branch1') {
			this.statusMessage = '1호점 목록 로딩 중...';
			const q = query(collection(db, 'libraries', 'branch1', 'songs'), orderBy('order', 'asc'));
			const unsub = onSnapshot(q, (snapshot) => {
				this._branchSongsList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), isOld: false }));
				this._oldSongsList = [];
				this._updateMergedList();
			});
			this._unsubscribeFirestore = () => unsub();
		} else if (branch === 'branch2') {
			this.statusMessage = '2호점 목록 로딩 중...';
			const qBranch2 = query(collection(db, 'libraries', 'branch2', 'songs'), orderBy('order', 'asc'));
			const unsubBranch2 = onSnapshot(qBranch2, (snapshot) => {
				this._branchSongsList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), isOld: false }));
				this._updateMergedList();
			});
			const qOld = query(collection(db, 'songs'), orderBy('order', 'asc'));
			const unsubOld = onSnapshot(qOld, (snapshot) => {
				this._oldSongsList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), isOld: true }));
				this._updateMergedList();
			});
			this._unsubscribeFirestore = () => { unsubBranch2(); unsubOld(); };
		}
	}

	_updateMergedList() {
		const combined = [...this._branchSongsList, ...this._oldSongsList];
		combined.sort((a, b) => (a.order || 0) - (b.order || 0));
		this.songs = combined;
		this.cancelEdit();
		if (!this.isShuffle) {
			this.playQueue = [...this.songs];
			this.currentQueueIndex = this.currentSong ? this.songs.findIndex((s) => s.id === this.currentSong.id) : -1;
		}
		this.currentListIndex = this.currentSong ? this.songs.findIndex((s) => s.id === this.currentSong.id) : -1;
		this._updateStatusMessage();
	}

	switchBranch(branchId) {
		if ((this.deviceMode === 'branch1' || this.deviceMode === 'branch2') && this.deviceMode !== branchId) return;
		if (branchId === this.currentBranch && !this.isLoading && this.songs.length > 0) return;
		this.currentBranch = branchId;
		this._cleanupResources();
		this.subscribeToBranch(branchId);
	}

	subscribeToAllDeviceStatuses() {
		if (this._unsubscribeMonitoring) this._unsubscribeMonitoring();
		if (!db) return;
		const unsub1 = onSnapshot(doc(db, 'libraries', 'branch1', 'status', 'nowPlaying'), (doc) => (this.monitoringStatus.branch1 = doc.data() || null));
		const unsub2 = onSnapshot(doc(db, 'libraries', 'branch2', 'status', 'nowPlaying'), (doc) => (this.monitoringStatus.branch2 = doc.data() || null));
		this._unsubscribeMonitoring = () => { unsub1(); unsub2(); };
	}

	async _syncPlaybackStatus() {
		if (this.deviceMode !== 'branch1' && this.deviceMode !== 'branch2') return;
		if (!db) return;
		const statusRef = doc(db, 'libraries', this.deviceMode, 'status', 'nowPlaying');
		const data = {
			isPlaying: this.isPlaying,
			updatedAt: serverTimestamp(),
			currentSong: this.currentSong ? { id: this.currentSong.id, title: this.currentSong.title, artist: this.currentSong.artist, isOld: !!this.currentSong.isOld } : null
		};
		try { await setDoc(statusRef, data); } catch (e) { console.error('[Sync] Failed:', e); }
	}

	setPlaybackState(isPlaying) {
		if (this.isPlaying !== isPlaying) {
			this.isPlaying = isPlaying;
			this._syncPlaybackStatus();
		}
	}

	async loadAndPlaySong(song) {
		if (!song) return;
		if (this._activeBlobUrl) { URL.revokeObjectURL(this._activeBlobUrl); this._activeBlobUrl = null; }
		const cachedBlob = await getCachedAudio(song.id);
		let playSrc = song.src;
		let isCached = false;
		if (cachedBlob) { this._activeBlobUrl = URL.createObjectURL(cachedBlob); playSrc = this._activeBlobUrl; isCached = true; } 
		else { this._downloadToCache(song); }
		this.currentSong = { ...song, src: playSrc, _isLocal: isCached };
	}

    // ... (나머지 로직은 그대로 유지)
    async _downloadToCache(song) {
		try {
			const response = await fetch(song.src);
			if (!response.ok) throw new Error('Network error');
			const blob = await response.blob();
			await cacheAudio(song.id, blob);
			this.cachedSongIds = new Set(this.cachedSongIds).add(song.id);
		} catch (e) { console.error(`Download failed: ${song.title}`, e); }
	}
	async _syncCacheStatus() {
		const ids = await getCachedSongIds();
		this.cachedSongIds = new Set(ids);
	}
	toggleShuffle() {
		this.isShuffle = !this.isShuffle;
		if (!this.isShuffle) { this.playQueue = [...this.songs]; } 
		else {
			const otherSongs = this.songs.filter((s) => s.id !== this.currentSong?.id);
			this.playQueue = this.currentSong ? [this.currentSong, ...this._getShuffledArray(otherSongs)] : this._getShuffledArray(this.songs);
		}
		this.currentQueueIndex = this.currentSong ? this.playQueue.findIndex((s) => s.id === this.currentSong.id) : -1;
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
	async handleFileUpload(files) {
		if (!files || files.length === 0 || !this.isAdmin) return;
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
					await addDoc(collection(db, 'libraries', this.currentBranch, 'songs'), {
						title, artist, album: ' ', src: url, fileName: file.name, createdAt: serverTimestamp(), order: Date.now()
					});
					success++;
				} catch (e) { console.error('Upload failed:', e); fail++; }
			}
		} finally { this.isLoading = false; this.statusMessage = `완료: 성공 ${success}, 실패 ${fail}`; }
	}
	startEdit(song) { this.editingSongId = song.id; this.editTitle = song.title; this.editArtist = song.artist; }
	cancelEdit() { this.editingSongId = null; this.editTitle = ''; this.editArtist = ''; }
	async saveEdit(songId) {
		if (!this.isAdmin || songId !== this.editingSongId) return;
		this.isLoading = true;
		try {
			const song = this.songs.find((s) => s.id === songId);
			if (!song) throw new Error('Song not found');
			const ref = this._getSongDocRef(song);
			await updateDoc(ref, { title: this.editTitle.trim(), artist: this.editArtist.trim() });
			this.statusMessage = '수정 완료';
		} catch (e) { console.error('Edit failed:', e); this.statusMessage = '수정 실패'; }
		finally { this.isLoading = false; this.cancelEdit(); }
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
		} catch (e) { console.error('Move failed:', e); } finally { this.isLoading = false; }
	}
	async deleteSong(song) {
		if (!this.isAdmin || this.editingSongId) return;
		this.isLoading = true;
		try {
			if (this.currentSong?.id === song.id) {
				if (this._activeBlobUrl) { URL.revokeObjectURL(this._activeBlobUrl); this._activeBlobUrl = null; }
				this.currentSong = null;
				this.isPlaying = false;
				this._syncPlaybackStatus();
			}
			this.playQueue = this.playQueue.filter((s) => s.id !== song.id);
			if (song.src) { try { await deleteObject(ref(storage, song.src)); } catch (e) {} }
			await deleteDoc(this._getSongDocRef(song));
			await removeCachedAudio(song.id);
			const nextCache = new Set(this.cachedSongIds);
			nextCache.delete(song.id);
			this.cachedSongIds = nextCache;
			this.statusMessage = '삭제 완료';
		} catch (e) { console.error('Delete failed:', e); } finally { this.isLoading = false; }
	}
	_getSongDocRef(song) {
		if (song.isOld) return doc(db, 'songs', song.id);
		return doc(db, 'libraries', this.currentBranch, 'songs', song.id);
	}
}

export const musicState = new MusicState();