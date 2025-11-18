<script>
	import { onMount } from 'svelte';
	import { init } from '$lib/store.js';

	let { children } = $props();

	onMount(() => {
		init(); // 스토어의 인증 감지 로직을 초기화합니다.
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