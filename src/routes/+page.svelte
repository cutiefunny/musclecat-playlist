<script>
	// [수정됨] handleAuthToggle, UploadCard 관련 임포트 제거
	import { currentBranch, subscribeToBranch } from '$lib/store.js';

	// 컴포넌트 임포트
	import BranchSelector from '$lib/components/BranchSelector.svelte';
	// import UploadCard from '$lib/components/UploadCard.svelte'; // [제거됨]
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import SongList from '$lib/components/SongList.svelte';

	// currentBranch 스토어가 변경될 때마다 구독 함수를 다시 호출
	currentBranch.subscribe((branch) => {
		subscribeToBranch(branch);
	});
</script>

<main>
	<h1>근육고양이 플레이리스트</h1>

	<BranchSelector isAdminView={false} />

	<AudioPlayer />

	<SongList isAdminView={false} />
</main>

<style>
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
		/* [수정됨] cursor, user-select 등 상호작용 스타일 제거 */
		flex-shrink: 0;
		margin-bottom: 0.5rem;
	}
</style>