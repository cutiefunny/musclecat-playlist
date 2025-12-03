<script>
	import { musicState } from '$lib/musicState.svelte.js';
</script>

{#if musicState.toast.visible}
	<div class="toast {musicState.toast.type}">
		{musicState.toast.message}
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		bottom: 2rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.8rem 1.5rem;
		border-radius: 50px;
		color: #fff;
		font-weight: bold;
		font-size: 0.9rem;
		z-index: 9999;
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
		animation: fadein 0.3s, fadeout 0.3s 2.7s;
	}
	.toast.info {
		background-color: #333;
		border: 1px solid #555;
	}
	.toast.error {
		background-color: #b04040;
		border: 1px solid #d06060;
	}
	.toast.success {
		background-color: #3a5a51;
		border: 1px solid #40c9a9;
		color: #40c9a9;
	}

	@keyframes fadein {
		from { bottom: 0; opacity: 0; }
		to { bottom: 2rem; opacity: 1; }
	}
	@keyframes fadeout {
		from { bottom: 2rem; opacity: 1; }
		to { bottom: 0; opacity: 0; }
	}
</style>