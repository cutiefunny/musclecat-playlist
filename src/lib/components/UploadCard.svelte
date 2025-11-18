<script>
	import {
		isAdmin,
		isLoading,
		statusMessage,
		handleFileUpload
	} from '$lib/store.js';
</script>

{#if $isAdmin}
	<div class="card">
		<label for="file-upload" class="file-label" class:disabled={$isLoading}>
			{$isLoading ? '처리 중...' : '음원 파일 선택'}
		</label>
		<input
			id="file-upload"
			type="file"
			accept="audio/*"
			on:change={handleFileUpload}
			style="display: none;"
			disabled={$isLoading}
			multiple
		/>
		<span class="statusMessage">{$statusMessage}</span>
	</div>
{/if}

<style>
	.card {
		background-color: #1e1e1e;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
		min-height: 50px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		flex-shrink: 0;
	}
	.file-label {
		background-color: #40c9a9;
		color: #121212;
		padding: 0.75rem 1.25rem;
		border-radius: 5px;
		cursor: pointer;
		font-weight: bold;
		transition: background-color 0.2s;
	}
	.file-label:hover {
		background-color: #36ab8f;
	}
	.file-label.disabled {
		background-color: #555;
		cursor: not-allowed;
	}
	.statusMessage {
		display: block;
		margin-top: 1rem;
		color: #a0a0a0;
		font-style: italic;
	}
	.file-label + .statusMessage {
		margin-top: 1rem;
	}
	:not(.file-label) + .statusMessage {
		margin-top: 0;
	}
</style>