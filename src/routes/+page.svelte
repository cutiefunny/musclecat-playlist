<script>
	import { musicState } from '$lib/musicState.svelte.js';
	import BranchSelector from '$lib/components/BranchSelector.svelte';
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import SongList from '$lib/components/SongList.svelte';
	import DeviceSetup from '$lib/components/DeviceSetup.svelte';

	function handleReset() {
		if (confirm('기기 설정을 초기화하고 선택 화면으로 돌아가시겠습니까?')) {
			musicState.resetDeviceMode();
		}
	}
</script>

<main>
	{#if musicState.deviceMode === null}
		<DeviceSetup />
	{:else}
		<div class="header-area">
			<h1>
				{#if musicState.deviceMode === 'branch1'}
					근육고양이 1호점
				{:else if musicState.deviceMode === 'branch2'}
					근육고양이 2호점
				{:else}
					근육고양이 플레이리스트
				{/if}
			</h1>
			
			<button class="reset-btn" onclick={handleReset} title="기기 설정 초기화" aria-label="기기 설정 초기화">
				⚙️
			</button>
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
	
	.header-area {
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		margin-bottom: 0.5rem;
		flex-shrink: 0;
	}

	h1 {
		color: #40c9a9;
		margin: 0;
		font-size: 1.5rem;
	}

	.reset-btn {
		position: absolute;
		right: 0;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1.2rem;
		padding: 0.5rem;
		transition: transform 0.2s;
		opacity: 0.7;
	}
	.reset-btn:hover {
		transform: rotate(90deg);
		opacity: 1;
	}
</style>