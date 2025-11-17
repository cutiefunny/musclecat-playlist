import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
// 'firebase/auth'에서 필요한 함수들을 추가로 가져옵니다.
import {
	getAuth,
	GoogleAuthProvider,
	signInWithPopup,
	signOut,
	onAuthStateChanged
} from 'firebase/auth';

// 1. .env 파일에서 Firebase 설정 값 가져오기
const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// 2. Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// 3. Firebase 서비스 가져오기
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// 4. Google Auth Provider 생성
const googleProvider = new GoogleAuthProvider();

// 5. 로그인/로그아웃 함수 생성
const login = async () => {
	try {
		await signInWithPopup(auth, googleProvider);
	} catch (error) {
		console.error('Google 로그인 실패:', error);
		throw error;
	}
};

const logout = async () => {
	try {
		await signOut(auth);
	} catch (error) {
		console.error('로그아웃 실패:', error);
		throw error;
	}
};

// 6. Firebase 서비스 및 인증 함수 내보내기
// onAuthStateChanged도 함께 내보내 Svelte 컴포넌트에서 인증 상태를 감지할 수 있게 합니다.
export { db, storage, auth, onAuthStateChanged, login, logout };