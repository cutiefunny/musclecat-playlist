<script>
	import {
		currentBranch,
		isLoading,
		editingSongId,
		switchBranch
	} from '$lib/store.js';

	// [신규] prop: 관리자 뷰인지 여부 (기본값 false)
	export let isAdminView = false;
</script>

<div class="branch-selector">
	<button
		class:active={$currentBranch === 'branch1'}
		on:click={() => switchBranch('branch1')}
		disabled={$isLoading || (isAdminView && $editingSongId)}
	>
		1호점 라이브러리
	</button>
	<button
		class:active={$currentBranch === 'branch2'}
		on:click={() => switchBranch('branch2')}
		disabled={$isLoading || (isAdminView && $editingSongId)}
	>
		2호점 라이브러리
	</button>
</div>

<style>
	.branch-selector {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-shrink: 0;
	}
	.branch-selector button {
		background-color: #333;
		color: #aaa;
		border: 2px solid #555;
		border-radius: 20px;
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.2s;
	}
	.branch-selector button:hover:not(:disabled) {
		background-color: #444;
		border-color: #777;
	}
	.branch-selector button.active {
		background-color: #40c9a9;
		color: #121212;
		border-color: #40c9a9;
	}
	.branch-selector button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>