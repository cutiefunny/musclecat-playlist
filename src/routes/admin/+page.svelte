<script>
	import {
		currentBranch,
		subscribeToBranch,
		handleAuthToggle,
		isAdmin,
		currentUser
	} from '$lib/store.js';

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
		Admin - 근육고양이
	</h1>

	{#if $currentUser}
		{#if $isAdmin}
			<BranchSelector isAdminView={true} />

			<UploadCard />

			<AudioPlayer />

			<SongList isAdminView={true} />
		{:else}
			<div class="card">
				<p>관리자 계정({$currentUser.email})이 아닙니다.</p>
				<p>스트리밍은 메인 페이지에서 이용해 주세요.</p>
				<button class="logout-button" on:click={handleAuthToggle}>로그아웃</button>
			</div>
		{/if}
	{:else}
		<div class="card">
			<p>관리자 기능(업로드, 수정, 삭제)을 사용하려면 로그인이 필요합니다.</p>
			<button class="login-button" on:click={handleAuthToggle}>
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
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
		flex-shrink: 0;
		margin-bottom: 0.5rem;
	}

	/* 로그인/아웃 버튼 스타일 */
	.card {
		background-color: #1e1e1e;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
		flex-shrink: 0;
	}
	.login-button,
	.logout-button {
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
	.login-button:hover,
	.logout-button:hover {
		background-color: #36ab8f;
	}
	.logout-button {
		background-color: #555;
		color: #fff;
	}
	.logout-button:hover {
		background-color: #777;
	}
</style>