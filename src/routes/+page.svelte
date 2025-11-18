<script>
	// 필요한 스토어와 함수만 개별적으로 임포트
	import { currentBranch, subscribeToBranch, handleAuthToggle } from '$lib/store.js';

	// 컴포넌트 임포트
	import BranchSelector from '$lib/components/BranchSelector.svelte';
	import UploadCard from '$lib/components/UploadCard.svelte';
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import SongList from '$lib/components/SongList.svelte';

	// currentBranch 스토어가 변경될 때마다 구독 함수를 다시 호출
	currentBranch.subscribe((branch) => {
		subscribeToBranch(branch);
	});
</script>

<main>
	<h1 on:click={handleAuthToggle} title="관리자 로그인/로그아웃 (클릭)">
		근육고양이 플레이리스트
	</h1>

	<BranchSelector />

	<UploadCard />

	<AudioPlayer />

	<SongList />
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
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
		flex-shrink: 0;
		margin-bottom: 0.5rem;
	}
</style>