<script>
	import { currentSong, playNext, playPrevious } from '$lib/store.js';

	let audioEl;

	// Media Session API 로직
	function setupMediaSession(song) {
		if (!('mediaSession' in navigator) || !song) return;

		const metadata = {
			title: song.title,
			artist: song.artist || '아티스트 없음',
			album: song.album || ' '
		};
		navigator.mediaSession.metadata = new MediaMetadata(metadata);

		navigator.mediaSession.setActionHandler('play', () => {
			audioEl?.play();
			navigator.mediaSession.playbackState = 'playing';
		});
		navigator.mediaSession.setActionHandler('pause', () => {
			audioEl?.pause();
			navigator.mediaSession.playbackState = 'paused';
		});
		navigator.mediaSession.setActionHandler('nexttrack', playNext);
		navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
	}

	function onPlay() {
		if (audioEl) {
			navigator.mediaSession.playbackState = 'playing';
			setupMediaSession($currentSong); // $currentSong으로 스토어 값 읽기
		}
	}
	function onPause() {
		navigator.mediaSession.playbackState = 'paused';
	}
	function onEnded() {
		console.log('Song ended, playing next.');
		playNext();
	}
</script>

{#if $currentSong}
	<div class="player-wrapper">
		<div class="player-info">
			<p class="now-playing">
				<strong>{$currentSong.title}</strong>
				<span>{$currentSong.artist}</span>
			</p>
			<audio
				bind:this={audioEl}
				src={$currentSong.src}
				controls
				controlsList="nodownload"
				autoplay
				on:play={onPlay}
				on:pause={onPause}
				on:ended={onEnded}
			>
				<p>お使い의 ブラウザは audio 要素를 지원하지 않습니다.</p>
			</audio>
		</div>
	</div>
{/if}

<style>
	.player-wrapper {
		margin-top: 1rem;
		background-color: #2a2a2a;
		padding: 1rem;
		border-radius: 8px;
		flex-shrink: 0;
		margin-bottom: 1rem;
	}

	.player-info {
	}
	.now-playing {
		margin: 0 0 0.5rem 0;
		text-align: center;
	}
	.now-playing strong {
		display: block;
		font-size: 1.1rem;
	}
	.now-playing span {
		color: #aaa;
	}
	audio {
		width: 100%;
	}
</style>