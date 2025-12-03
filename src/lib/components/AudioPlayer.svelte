<script>
	import { musicState } from '$lib/musicState.svelte.js';

	let audioEl;
	let currentTime = $state(0);
	let duration = $state(0);
	let paused = $state(true);
	let volume = $state(1);

	function formatTime(seconds) {
		if (!seconds || isNaN(seconds)) return '0:00';
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	// [수정] 로컬 버튼: 오디오를 직접 제어 (Direct Control) -> 가장 확실함
	function togglePlay() {
		if (!audioEl) return;
		if (audioEl.paused) {
			audioEl.play().catch((e) => console.warn('Local Play failed:', e));
		} else {
			audioEl.pause();
		}
	}

	function toggleRepeat() {
		musicState.repeatMode = (musicState.repeatMode + 1) % 3;
	}

	function onEnded() {
		if (musicState.repeatMode === 2) {
			audioEl.currentTime = 0;
			audioEl.play();
		} else if (musicState.repeatMode === 1) {
			musicState.playNext();
		} else {
			if (musicState.currentQueueIndex < musicState.playQueue.length - 1) {
				musicState.playNext();
			} else {
				musicState.setPlaybackState(false);
			}
		}
	}

	// [신규] 원격 명령 감지 ($effect): 명령 이벤트가 들어오면 무조건 실행
	$effect(() => {
		const cmd = musicState.lastCommandEvent;
		if (cmd && audioEl) {
			if (cmd.type === 'play') {
				audioEl.play().catch((e) => console.warn('Remote Play failed:', e));
			} else if (cmd.type === 'pause') {
				audioEl.pause();
			}
			// next, prev 등은 musicState에서 데이터가 변경되므로 여기선 play/pause만 처리
		}
	});

	// [유지] Media Session API
	$effect(() => {
		if (musicState.currentSong && 'mediaSession' in navigator) {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: musicState.currentSong.title,
				artist: musicState.currentSong.artist || '아티스트 없음',
				album: ' '
			});
			navigator.mediaSession.setActionHandler('play', () => audioEl?.play());
			navigator.mediaSession.setActionHandler('pause', () => audioEl?.pause());
			navigator.mediaSession.setActionHandler('nexttrack', () => musicState.playNext());
			navigator.mediaSession.setActionHandler('previoustrack', () => musicState.playPrevious());
		}
	});

	function onPlay() {
		paused = false;
		musicState.setPlaybackState(true); // 상태 동기화
		if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
	}
	
	function onPause() {
		paused = true;
		musicState.setPlaybackState(false); // 상태 동기화
		if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
	}
</script>

{#if musicState.currentSong}
	<div class="player-wrapper">
		<div class="player-info">
			<p class="now-playing">
				<strong>{musicState.currentSong.title}</strong>
				<span>{musicState.currentSong.artist}</span>
			</p>
		</div>

		<div class="progress-container">
			<span class="time current">{formatTime(currentTime)}</span>
			<input type="range" class="progress-bar" min="0" max={duration || 0} bind:value={currentTime} disabled={!duration} />
			<span class="time total">{formatTime(duration)}</span>
		</div>

		<div class="controls">
			<button type="button" class="control-btn repeat-btn" class:active={musicState.repeatMode !== 0} onclick={toggleRepeat}>
				{#if musicState.repeatMode === 2} 🔂 {:else if musicState.repeatMode === 1} 🔁 {:else} ➡️ {/if}
			</button>
			<button type="button" class="control-btn prev-btn" onclick={() => musicState.playPrevious()}>⏮️</button>
			
			<button type="button" class="control-btn play-btn" onclick={togglePlay}>
				{#if paused} ▶️ {:else} ⏸️ {/if}
			</button>

			<button type="button" class="control-btn next-btn" onclick={() => musicState.playNext()}>⏭️</button>
			<div class="spacer"></div>
		</div>

		<div class="volume-container">
			<span class="volume-icon">{volume === 0 ? '🔇' : '🔊'}</span>
			<input type="range" class="volume-slider" min="0" max="1" step="0.01" bind:value={volume} />
		</div>

		<audio
			bind:this={audioEl}
			src={musicState.currentSong.src}
			bind:currentTime
			bind:duration
			bind:paused
			bind:volume
			autoplay
			onplay={onPlay}
			onpause={onPause}
			onended={onEnded}
		></audio>
	</div>
{/if}

<style>
/* 기존 스타일 유지 */
	.player-wrapper {
		margin-top: 1rem;
		background-color: #2a2a2a;
		padding: 1.2rem;
		border-radius: 12px;
		flex-shrink: 0;
		margin-bottom: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
	}
	.now-playing { margin: 0; text-align: center; }
	.now-playing strong { display: block; font-size: 1.1rem; margin-bottom: 0.2rem; color: #fff; }
	.now-playing span { color: #aaa; font-size: 0.9rem; }
	.progress-container { display: flex; align-items: center; gap: 0.5rem; }
	.progress-bar { flex-grow: 1; accent-color: #40c9a9; cursor: pointer; height: 4px; }
	.time { font-size: 0.75rem; color: #bbb; min-width: 35px; }
	.time.current { text-align: right; }
	.controls { display: flex; justify-content: space-between; align-items: center; padding: 0 1rem; }
	.control-btn { background: none; border: none; cursor: pointer; font-size: 1.5rem; color: #e0e0e0; padding: 0.5rem; transition: transform 0.1s, color 0.2s; display: flex; align-items: center; justify-content: center; }
	.control-btn:active { transform: scale(0.95); }
	.play-btn { font-size: 2rem; }
	.repeat-btn { font-size: 1.2rem; color: #666; }
	.repeat-btn.active { color: #40c9a9; }
	.spacer { width: 1.2rem; }
	.volume-container { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 0.2rem; }
	.volume-icon { font-size: 1.2rem; }
	.volume-slider { width: 50%; accent-color: #aaa; height: 4px; cursor: pointer; }
</style>