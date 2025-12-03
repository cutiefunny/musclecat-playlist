<script>
	import { musicState } from '$lib/musicState.svelte.js';

	// PIN 관련 상태 (Svelte 5 Runes)
	let showPinModal = $state(false);
	let targetMode = $state(null);
	let pinInput = $state('');
	let errorMsg = $state('');

	// 1호점/2호점 선택 시 모달 열기
	function handleBranchSelect(mode) {
		targetMode = mode;
		pinInput = '';
		errorMsg = '';
		showPinModal = true;
	}

	// PIN 검증 로직
	function verifyPin() {
		if (pinInput === '7997') {
			musicState.setDeviceMode(targetMode);
			showPinModal = false;
		} else {
			errorMsg = 'PIN 번호가 올바르지 않습니다.';
			pinInput = ''; // 틀리면 입력 초기화
		}
	}

	// 취소
	function cancelPin() {
		showPinModal = false;
		targetMode = null;
		pinInput = '';
	}

	// 엔터키 입력 지원
	function handleKeydown(e) {
		if (e.key === 'Enter') verifyPin();
		if (e.key === 'Escape') cancelPin();
	}
</script>

<div class="setup-container">
	{#if showPinModal}
		<div class="pin-modal">
			<h3>🔒 기기 인증</h3>
			<p>
				<span class="highlight">{targetMode === 'branch1' ? '1호점' : '2호점'} 플레이어</span>로<br />
				설정하려면 PIN을 입력하세요.
			</p>
			
			<input
				type="password"
				class="pin-input"
				bind:value={pinInput}
				placeholder="PIN 번호 (4자리)"
				maxlength="4"
				onkeydown={handleKeydown}
				autocomplete="off"
				autofocus
			/>
			
			{#if errorMsg}
				<p class="error-msg">{errorMsg}</p>
			{/if}

			<div class="modal-buttons">
				<button class="cancel-btn" onclick={cancelPin}>취소</button>
				<button class="confirm-btn" onclick={verifyPin}>확인</button>
			</div>
		</div>
		<div class="overlay" onclick={cancelPin} role="button" tabindex="0" onkeydown={cancelPin}></div>
	{:else}
		<h2>기기 설정</h2>
		<p>이 기기의 역할을 선택해주세요.</p>
		<p class="sub-text">매장 플레이어 설정 시 PIN 인증이 필요합니다.</p>

		<div class="button-group">
			<button class="setup-btn branch1" onclick={() => handleBranchSelect('branch1')}>
				🏪 1호점 플레이어
				<span class="desc">1호점 매장 음악 재생 (고정)</span>
			</button>

			<button class="setup-btn branch2" onclick={() => handleBranchSelect('branch2')}>
				🏪 2호점 플레이어
				<span class="desc">2호점 매장 음악 재생 (고정)</span>
			</button>
		</div>

		<hr />

		<button class="setup-btn general" onclick={() => musicState.setDeviceMode('general')}>
			📱 그 외 기기
			<span class="desc">관리자 / 모니터링 / 개인 청취</span>
		</button>
	{/if}
</div>

<style>
	.setup-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 80vh;
		padding: 2rem;
		text-align: center;
		position: relative;
	}
	h2 {
		font-size: 2rem;
		color: #40c9a9;
		margin-bottom: 0.5rem;
	}
	p {
		color: #e0e0e0;
		margin-bottom: 2rem;
	}
	.sub-text {
		color: #888;
		font-size: 0.9rem;
		margin-top: -1.5rem;
	}
	.button-group {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 320px;
		margin-bottom: 2rem;
	}
	hr {
		border: 0;
		border-top: 1px solid #333;
		width: 100%;
		max-width: 320px;
		margin-bottom: 2rem;
	}
	.setup-btn {
		background-color: #333;
		border: 2px solid #555;
		border-radius: 12px;
		padding: 1.2rem;
		color: #fff;
		font-size: 1.1rem;
		font-weight: bold;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		transition: all 0.2s;
	}
	.setup-btn:hover {
		background-color: #444;
		border-color: #888;
		transform: translateY(-2px);
	}
	.setup-btn .desc {
		font-size: 0.8rem;
		color: #aaa;
		font-weight: normal;
		margin-top: 0.3rem;
	}
	.branch1:hover { border-color: #40c9a9; color: #40c9a9; }
	.branch2:hover { border-color: #40c9a9; color: #40c9a9; }
	.general { background-color: #1e1e1e; border-style: dashed; }
	.general:hover { border-color: #40c9a9; }

	/* 모달 스타일 */
	.overlay {
		position: fixed;
		top: 0; left: 0; right: 0; bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		z-index: 100;
	}
	.pin-modal {
		position: relative;
		z-index: 101;
		background-color: #252525;
		padding: 2rem;
		border-radius: 12px;
		width: 90%;
		max-width: 300px;
		box-shadow: 0 10px 25px rgba(0,0,0,0.5);
		border: 1px solid #444;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.pin-modal h3 {
		margin: 0 0 1rem 0;
		color: #40c9a9;
	}
	.pin-modal p {
		font-size: 0.95rem;
		color: #ccc;
		margin-bottom: 1.5rem;
		line-height: 1.4;
	}
	.highlight {
		color: #fff;
		font-weight: bold;
	}
	.pin-input {
		width: 100%;
		padding: 0.8rem;
		font-size: 1.2rem;
		text-align: center;
		background-color: #1e1e1e;
		border: 1px solid #555;
		border-radius: 8px;
		color: #fff;
		margin-bottom: 1rem;
		letter-spacing: 0.3rem;
	}
	.pin-input:focus {
		border-color: #40c9a9;
		outline: none;
	}
	.error-msg {
		color: #ff6b6b;
		font-size: 0.85rem;
		margin-top: -0.5rem;
		margin-bottom: 1rem;
	}
	.modal-buttons {
		display: flex;
		gap: 0.5rem;
		width: 100%;
	}
	.modal-buttons button {
		flex: 1;
		padding: 0.8rem;
		border-radius: 8px;
		border: none;
		font-weight: bold;
		cursor: pointer;
		font-size: 1rem;
	}
	.cancel-btn {
		background-color: #444;
		color: #ccc;
	}
	.confirm-btn {
		background-color: #40c9a9;
		color: #121212;
	}
</style>