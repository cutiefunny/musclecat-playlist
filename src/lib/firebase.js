import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, signInAnonymously } from 'firebase/auth';

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

// 3. Firebase 서비스 내보내기
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// 4. 익명 로그인을 통해 Firestore/Storage 권한 확보 (보안 규칙에 따라 필요)
//    (사용자 로그인 기능이 없다면, 익명 로그인을 통해 간단히 권한을 얻습니다.)
signInAnonymously(auth).catch((error) => {
	console.error('Anonymous sign-in failed:', error);
});

export { db, storage, auth };