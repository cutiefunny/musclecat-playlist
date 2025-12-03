<script>
	import { onMount } from 'svelte';
	import { musicState } from '$lib/musicState.svelte.js';

	let { children } = $props();

	onMount(() => {
		musicState.init(); // 로컬 스토리지 체크 및 초기화
	});
</script>

<style>
	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
			'Open Sans', 'Helvetica Neue', sans-serif;
		background-color: #121212;
		color: #e0e0e0;
		margin: 0;
		overflow: hidden;
		height: 100vh;
	}
</style>

{@render children()}