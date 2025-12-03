<script>
	import { musicState } from '$lib/musicState.svelte.js';

	let { song, index, isAdminView = false } = $props();
</script>

<li class:playing={musicState.currentListIndex === index}>
	{#if isAdminView && musicState.isAdmin}
		<div class="move-controls">
			<button
				type="button"
				class="move-button"
				onclick={() => musicState.moveSong(index, 'up')}
				disabled={index === 0 || musicState.isLoading || musicState.editingSongId}
				aria-label="위로 이동"
			>
				🔼
			</button>
			<button
				type="button"
				class="move-button"
				onclick={() => musicState.moveSong(index, 'down')}
				disabled={index === musicState.songs.length - 1 || musicState.isLoading || musicState.editingSongId}
				aria-label="아래로 이동"
			>
				🔽
			</button>
		</div>
	{/if}

	{#if isAdminView && musicState.editingSongId === song.id}
		<form class="edit-form" onsubmit={(e) => { e.preventDefault(); musicState.saveEdit(song.id); }}>
			<input
				type="text"
				class="edit-input"
				bind:value={musicState.editTitle}
				placeholder="제목"
				required
			/>
			<input
				type="text"
				class="edit-input"
				bind:value={musicState.editArtist}
				placeholder="아티스트"
				required
			/>
			<button type="submit" class="edit-button edit-save" disabled={musicState.isLoading}>저장</button>
			<button
				type="button"
				class="edit-button edit-cancel"
				onclick={() => musicState.cancelEdit()}
				disabled={musicState.isLoading}
			>
				취소
			</button>
		</form>
	{:else}
		<button
			type="button"
			class="song-button"
			onclick={() => musicState.playSong(song)}
			aria-label="Play {song.title}"
			disabled={isAdminView && !!musicState.editingSongId}
		>
			<div class="song-info">
				<span class="title">
					{song.title}
					{#if musicState.cachedSongIds.has(song.id)}
						<span class="cached-icon" title="기기에 저장됨">💾</span>
					{/if}
				</span>
				<span class="artist">{song.artist}</span>
				{#if isAdminView && musicState.isAdmin && musicState.currentBranch === 'branch2' && song.isOld}
					<span class="old-tag">(기존 곡)</span>
				{/if}
			</div>
		</button>

		{#if isAdminView && musicState.isAdmin}
			<div class="admin-controls">
				<button
					type="button"
					class="edit-button"
					onclick={() => musicState.startEdit(song)}
					disabled={musicState.isLoading || !!musicState.editingSongId}
					aria-label="Edit {song.title}"
				>
					✏️
				</button>
				<button
					type="button"
					class="delete-button"
					onclick={() => musicState.deleteSong(song)}
					disabled={musicState.isLoading || !!musicState.editingSongId}
					aria-label="Delete {song.title}"
				>
					&times;
				</button>
			</div>
		{/if}
	{/if}
</li>

<style>
    /* 기존 스타일 그대로 유지 */
	li {
		border-bottom: 1px solid #2a2a2a;
		display: flex;
		align-items: stretch;
		transition: background-color 0.2s;
	}
	li.playing {
		background-color: #3a5a51;
	}
	.move-controls {
		display: flex;
		flex-direction: column;
		justify-content: center;
		flex-shrink: 0;
		padding: 0 0.5rem;
	}
	.move-button {
		background: none;
		border: none;
		color: #888;
		cursor: pointer;
		padding: 0.1rem;
		font-size: 0.8rem;
		line-height: 1;
	}
	.move-button:hover {
		color: #fff;
	}
	.move-button:disabled {
		color: #444;
		cursor: not-allowed;
	}
	.song-button {
		display: block;
		width: 100%;
		padding: 0.75rem;
		background: none;
		border: none;
		cursor: pointer;
		transition: background-color 0.2s;
		text-align: left;
		color: inherit;
		flex-grow: 1;
		padding-left: 0.75rem;
	}
	.move-controls + .song-button {
		padding-left: 0.75rem;
	}
	li:not(:has(.move-controls)) .song-button {
		padding-left: 1.2rem;
	}
	.song-button:hover {
		background-color: #2a2a2a;
	}
	.song-button:disabled {
		cursor: not-allowed;
		background-color: transparent;
	}
	li.playing .song-button:hover {
		background: none;
	}
	.song-info {
		color: #e0e0e0;
	}
	.title {
		display: block;
		font-size: 1.1rem;
		font-weight: bold;
		color: #e0e0e0;
	}
	.cached-icon {
		font-size: 0.8em;
		margin-left: 0.3rem;
		cursor: help;
		vertical-align: middle;
	}
	.artist {
		display: block;
		font-size: 0.9rem;
		color: #a0a0a0;
	}
	.old-tag {
		display: inline-block;
		font-size: 0.75rem;
		color: #888;
		margin-left: 0.5rem;
		font-style: italic;
	}
	.edit-form {
		display: flex;
		flex-grow: 1;
		align-items: center;
		padding: 0.5rem 0.75rem;
		gap: 0.5rem;
	}
	.edit-input {
		flex-grow: 1;
		width: 30%;
		background-color: #333;
		color: #e0e0e0;
		border: 1px solid #555;
		border-radius: 4px;
		padding: 0.5rem;
		font-size: 0.9rem;
	}
	.edit-input:focus {
		border-color: #40c9a9;
		outline: none;
	}
	.admin-controls {
		display: flex;
		align-items: stretch;
		flex-shrink: 0;
	}
	.edit-button {
		background: none;
		border: none;
		color: #888;
		padding: 0 0.75rem;
		cursor: pointer;
		font-size: 1.2rem;
		transition: background-color 0.2s, color 0.2s;
	}
	.edit-button:hover {
		color: #40c9a9;
		background-color: #2a2a2a;
	}
	.edit-button.edit-save {
		font-size: 0.9rem;
		font-weight: bold;
		color: #40c9a9;
	}
	.edit-button.edit-cancel {
		font-size: 0.9rem;
		color: #aaa;
	}
	.edit-button.edit-save:hover {
		background-color: #36ab8f;
		color: #121212;
	}
	.edit-button.edit-cancel:hover {
		background-color: #555;
		color: #fff;
	}
	.edit-button:disabled {
		color: #555;
		cursor: not-allowed;
		background: none;
	}
	.delete-button {
		background: none;
		border: none;
		color: #888;
		padding: 0 1.25rem;
		cursor: pointer;
		font-size: 1.5rem;
		font-weight: bold;
		transition: background-color 0.2s, color 0.2s;
		flex-shrink: 0;
	}
	.delete-button:hover {
		background-color: #b04040;
		color: #fff;
	}
	.delete-button:disabled {
		color: #555;
		cursor: not-allowed;
		background: none;
	}
</style>