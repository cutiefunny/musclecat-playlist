<script>
	import {
		currentBranch,
		isShuffle,
		toggleShuffle,
		songs,
		isLoading
	} from '$lib/store.js';
	import SongItem from './SongItem.svelte';
</script>

<div class="playlist-wrapper">
	<div class="playlist-header">
		<h2 class="library-title">
			{$currentBranch === 'branch1' ? '1호점' : '2호점 (기존 곡 포함)'}
		</h2>
		<button
			type="button"
			class="shuffle-button"
			class:active={$isShuffle}
			on:click={toggleShuffle}
			title={$isShuffle ? '셔플 끄기' : '셔플 켜기'}
		>
			🔀
		</button>
	</div>

	{#if $songs.length === 0 && !$isLoading}
		<p>업로드된 음원이 없습니다.</p>
	{:else}
		<ul>
			{#each $songs as song, index (song.id)}
				<SongItem {song} {index} />
			{/each}
		</ul>
	{/if}
</div>

<style>
	.playlist-wrapper {
		text-align: left;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.playlist-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 2px solid #333;
		padding-bottom: 0.5rem;
		flex-shrink: 0;
	}
	.playlist-header h2 {
		margin: 0;
	}
	.shuffle-button {
		background: none;
		border: 2px solid #555;
		color: #888;
		border-radius: 50px;
		padding: 0.3rem 0.6rem;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}
	.shuffle-button:hover {
		border-color: #40c9a9;
		color: #40c9a9;
	}
	.shuffle-button.active {
		background-color: #40c9a9;
		border-color: #40c9a9;
		color: #121212;
	}

	.playlist-wrapper ul {
		list-style: none;
		padding: 0;
		margin: 0;
		flex-grow: 1;
		overflow-y: auto;
		min-height: 0;
	}
</style>