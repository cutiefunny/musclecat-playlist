<script>
	import { musicState } from '$lib/musicState.svelte.js';
	import BranchSelector from '$lib/components/BranchSelector.svelte';
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import SongList from '$lib/components/SongList.svelte';
	import DeviceSetup from '$lib/components/DeviceSetup.svelte';

	// 리셋 핸들러 (개발/테스트용 혹은 숨겨진 기능으로 활용 가능)
	function handleReset() {
		if (confirm('기기 설정을 초기화하시겠습니까?')) {
			musicState.resetDeviceMode();
		}
	}
</script>

<main>
	{#if musicState.deviceMode === null}
		<DeviceSetup />
	{:else}
		<div class="header-area">
			<h1 onclick={handleReset} title="클릭 시 기기 설정 초기화">
				{#if musicState.deviceMode === 'branch1'}
					근육고양이 1호점
				{:else if musicState.deviceMode === 'branch2'}
					근육고양이 2호점
				{:else}
					근육고양이 플레이리스트
				{/if}
			</h1>
		</div>

		{#if musicState.deviceMode === 'general'}
			<BranchSelector isAdminView={false} />
		{/if}

		<AudioPlayer />
		<SongList isAdminView={false} />
	{/if}
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
		flex-shrink: 0;
		margin-bottom: 0.5rem;
		cursor: pointer; /* 리셋 기능을 위해 커서 추가 */
	}
</style>