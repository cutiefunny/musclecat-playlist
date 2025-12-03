<script>
	import { onMount } from 'svelte';
	import { musicState } from '$lib/musicState.svelte.js';
	import BranchSelector from '$lib/components/BranchSelector.svelte';
	import UploadCard from '$lib/components/UploadCard.svelte';
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import SongList from '$lib/components/SongList.svelte';

	onMount(() => {
		// 관리자 페이지 진입 시 모든 지점 상태 구독 시작
		musicState.subscribeToAllDeviceStatuses();
	});
</script>

<main>
	<h1 onclick={() => musicState.handleAuthToggle()} title="관리자 로그인/로그아웃 (클릭)">
		Admin - 근육고양이
	</h1>

	{#if musicState.currentUser}
		{#if musicState.isAdmin}
			<div class="monitor-panel">
				<h3>🔴 실시간 매장 재생 현황</h3>
				<div class="monitor-grid">
					<div class="monitor-card branch1">
						<h4>1호점</h4>
						{#if musicState.monitoringStatus.branch1}
							<div class="status-content">
								{#if musicState.monitoringStatus.branch1.currentSong}
									<p class="song-title">{musicState.monitoringStatus.branch1.currentSong.title}</p>
									<p class="song-artist">{musicState.monitoringStatus.branch1.currentSong.artist}</p>
									<span class="badge {musicState.monitoringStatus.branch1.isPlaying ? 'playing' : 'paused'}">
										{musicState.monitoringStatus.branch1.isPlaying ? '재생 중 ▶️' : '일시정지 ⏸️'}
									</span>
								{:else}
									<p class="no-song">재생 중인 곡 없음</p>
								{/if}
							</div>
						{:else}
							<p class="offline">연결 대기 중...</p>
						{/if}
					</div>

					<div class="monitor-card branch2">
						<h4>2호점</h4>
						{#if musicState.monitoringStatus.branch2}
							<div class="status-content">
								{#if musicState.monitoringStatus.branch2.currentSong}
									<p class="song-title">{musicState.monitoringStatus.branch2.currentSong.title}</p>
									<p class="song-artist">{musicState.monitoringStatus.branch2.currentSong.artist}</p>
									<span class="badge {musicState.monitoringStatus.branch2.isPlaying ? 'playing' : 'paused'}">
										{musicState.monitoringStatus.branch2.isPlaying ? '재생 중 ▶️' : '일시정지 ⏸️'}
									</span>
								{:else}
									<p class="no-song">재생 중인 곡 없음</p>
								{/if}
							</div>
						{:else}
							<p class="offline">연결 대기 중...</p>
						{/if}
					</div>
				</div>
			</div>

			<BranchSelector isAdminView={true} />
			<UploadCard />
			<AudioPlayer />
			<SongList isAdminView={true} />
		{:else}
			<div class="card">
				<p>관리자 계정({musicState.currentUser.email})이 아닙니다.</p>
				<button class="logout-button" onclick={() => musicState.handleAuthToggle()}>로그아웃</button>
			</div>
		{/if}
	{:else}
		<div class="card">
			<p>관리자 기능을 사용하려면 로그인이 필요합니다.</p>
			<button class="login-button" onclick={() => musicState.handleAuthToggle()}>
				Google 계정으로 관리자 로그인
			</button>
		</div>
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
		cursor: pointer;
		user-select: none;
		flex-shrink: 0;
		margin-bottom: 0.5rem;
	}
	
	/* 모니터링 패널 스타일 */
	.monitor-panel {
		background-color: #252525;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 1.5rem;
		border: 1px solid #333;
		flex-shrink: 0;
	}
	.monitor-panel h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		color: #e0e0e0;
		text-align: left;
	}
	.monitor-grid {
		display: flex;
		gap: 1rem;
	}
	.monitor-card {
		flex: 1;
		background-color: #1e1e1e;
		padding: 0.8rem;
		border-radius: 6px;
		text-align: left;
	}
	.monitor-card h4 {
		margin: 0 0 0.5rem 0;
		font-size: 0.9rem;
		color: #888;
		border-bottom: 1px solid #333;
		padding-bottom: 0.3rem;
	}
	.song-title {
		font-weight: bold;
		font-size: 0.95rem;
		margin: 0.2rem 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.song-artist {
		font-size: 0.8rem;
		color: #aaa;
		margin: 0 0 0.5rem 0;
	}
	.badge {
		display: inline-block;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: bold;
	}
	.badge.playing {
		background-color: #3a5a51;
		color: #40c9a9;
		border: 1px solid #40c9a9;
	}
	.badge.paused {
		background-color: #333;
		color: #aaa;
		border: 1px solid #555;
	}
	.offline, .no-song {
		font-size: 0.8rem;
		color: #555;
		font-style: italic;
	}

	.card {
		background-color: #1e1e1e;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
		flex-shrink: 0;
	}
	.login-button, .logout-button {
		background-color: #40c9a9;
		color: #121212;
		padding: 0.75rem 1.25rem;
		border-radius: 5px;
		cursor: pointer;
		font-weight: bold;
		border: none;
		font-size: 1rem;
		transition: background-color 0.2s;
	}
	.login-button:hover, .logout-button:hover { background-color: #36ab8f; }
	.logout-button { background-color: #555; color: #fff; }
	.logout-button:hover { background-color: #777; }
</style>