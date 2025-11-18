<script>
	import {
		currentSong,
		playNext,
		playPrevious,
		repeatMode,
		playQueue,
		currentQueueIndex
	} from '$lib/store.js';

	let audioEl;
	let currentTime = 0;
	let duration = 0;
	let paused = true;
	let volume = 1; // 0 ~ 1

	// 시간 포맷팅 (MM:SS)
	function formatTime(seconds) {
		if (!seconds || isNaN(seconds)) return '0:00';
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	// 재생/일시정지 토글
	function togglePlay() {
		if (!audioEl) return;
		if (audioEl.paused) {
			audioEl.play();
		} else {
			audioEl.pause();
		}
	}

	// 반복 모드 토글: 0(없음) -> 1(전체) -> 2(한곡) -> 0...
	function toggleRepeat() {
		$repeatMode = ($repeatMode + 1) % 3;
	}

	// 곡이 끝났을 때 로직
	function onEnded() {
		console.log('Song ended. Repeat Mode:', $repeatMode);
		if ($repeatMode === 2) {
			// 한 곡 반복
			audioEl.currentTime = 0;
			audioEl.play();
		} else if ($repeatMode === 1) {
			// 전체 반복 (기본 playNext는 큐를 순환함)
			playNext();
		} else {
			// 반복 없음
			if ($currentQueueIndex < $playQueue.length - 1) {
				playNext();
			} else {
				console.log('End of playlist.');
				// 마지막 곡이면 정지 상태 유지 (자동 재생 안 함)
				paused = true;
			}
		}
	}

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
			setupMediaSession($currentSong);
		}
	}
	function onPause() {
		navigator.mediaSession.playbackState = 'paused';
	}
</script>

{#if $currentSong}
	<div class="player-wrapper">
		<div class="player-info">
			<p class="now-playing">
				<strong>{$currentSong.title}</strong>
				<span>{$currentSong.artist}</span>
			</p>
		</div>

		<div class="progress-container">
			<span class="time current">{formatTime(currentTime)}</span>
			<input
				type="range"
				class="progress-bar"
				min="0"
				max={duration || 0}
				bind:value={currentTime}
				disabled={!duration}
			/>
			<span class="time total">{formatTime(duration)}</span>
		</div>

		<div class="controls">
			<button
				type="button"
				class="control-btn repeat-btn"
				class:active={$repeatMode !== 0}
				on:click={toggleRepeat}
				title="반복 모드"
			>
				{#if $repeatMode === 2}
					🔂 {:else if $repeatMode === 1}
					🔁 {:else}
					➡️ {/if}
			</button>

			<button type="button" class="control-btn prev-btn" on:click={playPrevious}>
				⏮️
			</button>

			<button type="button" class="control-btn play-btn" on:click={togglePlay}>
				{#if paused}
					▶️
				{:else}
					⏸️
				{/if}
			</button>

			<button type="button" class="control-btn next-btn" on:click={playNext}>
				⏭️
			</button>

			<div class="spacer"></div>
		</div>

		<div class="volume-container">
			<span class="volume-icon">{volume === 0 ? '🔇' : '🔊'}</span>
			<input
				type="range"
				class="volume-slider"
				min="0"
				max="1"
				step="0.01"
				bind:value={volume}
				title="볼륨: {Math.round(volume * 100)}%"
			/>
		</div>

		<audio
			bind:this={audioEl}
			src={$currentSong.src}
			bind:currentTime
			bind:duration
			bind:paused
			bind:volume
			autoplay
			on:play={onPlay}
			on:pause={onPause}
			on:ended={onEnded}
		></audio>
	</div>
{/if}

<style>
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

	/* 1. 곡 정보 */
	.now-playing {
		margin: 0;
		text-align: center;
	}
	.now-playing strong {
		display: block;
		font-size: 1.1rem;
		margin-bottom: 0.2rem;
		color: #fff;
	}
	.now-playing span {
		color: #aaa;
		font-size: 0.9rem;
	}

	/* 2. 프로그레스 바 */
	.progress-container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.progress-bar {
		flex-grow: 1;
		accent-color: #40c9a9;
		cursor: pointer;
		height: 4px;
	}
	.time {
		font-size: 0.75rem;
		color: #bbb;
		min-width: 35px;
	}
	.time.current {
		text-align: right;
	}

	/* 3. 컨트롤 버튼 */
	.controls {
		display: flex;
		justify-content: space-between; /* 버튼들을 넓게 배치 */
		align-items: center;
		padding: 0 1rem;
	}
	.control-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1.5rem;
		color: #e0e0e0;
		padding: 0.5rem;
		transition: transform 0.1s, color 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.control-btn:active {
		transform: scale(0.95);
	}
	.play-btn {
		font-size: 2rem; /* 재생 버튼은 좀 더 크게 */
	}
	.repeat-btn {
		font-size: 1.2rem;
		color: #666; /* 비활성 느낌 */
	}
	.repeat-btn.active {
		color: #40c9a9; /* 활성화 컬러 */
	}
	.spacer {
		width: 1.2rem; /* repeat 버튼과 대칭을 위한 빈 공간 */
	}

	/* 4. 볼륨 컨트롤 */
	.volume-container {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 0.2rem;
	}
	.volume-icon {
		font-size: 1.2rem;
	}
	.volume-slider {
		width: 50%;
		accent-color: #aaa;
		height: 4px;
		cursor: pointer;
	}
</style>