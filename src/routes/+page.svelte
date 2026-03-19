<script>
  import { VirtualLinkCable } from '$lib/VirtualLinkCable';
  import { GBAEngine } from '$lib/GBAEngine';
  import { supabase } from '$lib/supabaseClient';
  import { onDestroy, onMount } from 'svelte';
  
  /** @type {string} */
  let roomId = $state('quetzal-123');
  /** @type {boolean} */
  let isConnected = $state(false);
  /** @type {any} */
  let linkCable = $state(null);
  
  /** @type {HTMLCanvasElement | null} */
  let gbaCanvas = $state(null);
  /** @type {string} */
  let romName = $state('No ROM Loaded');
  /** @type {Uint8Array | null} */
  let romData = $state(null);
  /** @type {GBAEngine | null} */
  let emulator = $state(null);
  /** @type {boolean} */
  let isFastForward = $state(false);

  /** @type {string[]} */
  let debugLogs = $state([]);

  /** @param {string} msg */
  function log(msg) {
    debugLogs.push(msg);
  }

  onMount(() => {
    if (gbaCanvas) {
      emulator = new GBAEngine(gbaCanvas, (msg) => log(msg));
    }
  });

  /** @param {boolean} isHost */
  function handleConnect(isHost) {
    // Cast linkCable to any to bypass "Property disconnect does not exist on type never"
    const oldLink = /** @type {any} */ (linkCable);
    if (oldLink) oldLink.disconnect();
    
    isConnected = false;
    linkCable = new VirtualLinkCable(
      roomId, isHost, 
      () => { isConnected = true; }, 
      (data) => { if (data === 'REFRESH_SAVE') downloadSaveFromCloud(); },
      (msg) => { log(msg); }
    );
  }

  /** @param {Event} event */
  function handleFileUpload(event) {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const file = target.files?.[0];
    if (file) {
      romName = file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        const res = e.target?.result;
        if (res instanceof ArrayBuffer) {
          romData = new Uint8Array(res);
          if (emulator) emulator.loadRom(romData, romName);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }

  async function uploadSaveToCloud() {
    if (!emulator || !romName) return;
    const saveData = emulator.exportBatterySave();
    if (!saveData) return;

    log("☁️ Uploading Save...");
    const safeName = romName.replace(/[^a-zA-Z0-9]/g, '_') + '.sav';
    const filePath = `${roomId}/${safeName}`;
    
    const { error } = await supabase.storage
      .from('saves')
      .upload(filePath, saveData, { upsert: true });

    if (error) log(`❌ Storage Error: ${error.message}`);
    else {
      log("✅ Cloud Sync Complete!");
      const activeLink = /** @type {any} */ (linkCable);
      if (activeLink) activeLink.sendData('REFRESH_SAVE');
    }
  }

  async function downloadSaveFromCloud() {
    if (!emulator || !romName) return;
    const safeName = romName.replace(/[^a-zA-Z0-9]/g, '_') + '.sav';
    const filePath = `${roomId}/${safeName}`;

    const { data, error } = await supabase.storage.from('saves').download(filePath);
    if (data) {
      const buffer = await data.arrayBuffer();
      emulator.injectBatterySave(new Uint8Array(buffer));
      log("🔄 Save Downloaded. Please reload ROM.");
    }
  }

  onDestroy(() => {
    const activeLink = /** @type {any} */ (linkCable);
    if (activeLink) activeLink.disconnect();
    if (emulator) emulator.stop();
  });
</script>

<div class="min-h-screen bg-gray-950 text-white flex flex-col items-center p-8 font-sans">
  <div class="w-full max-w-5xl flex justify-between items-end mb-8 border-b border-gray-800 pb-4">
    <h1 class="text-3xl font-bold text-blue-400">MyBoy Cloud</h1>
    <div class="flex items-center gap-4">
      <input type="text" bind:value={roomId} class="p-1.5 px-3 bg-gray-900 rounded text-white font-mono text-sm border border-gray-700 outline-none w-32" />
      {#if !isConnected}
        <button onclick={() => handleConnect(true)} class="bg-green-700 px-4 py-1.5 rounded font-bold cursor-pointer">Host</button>
        <button onclick={() => handleConnect(false)} class="bg-blue-700 px-4 py-1.5 rounded font-bold cursor-pointer">Join</button>
      {:else}
        <span class="text-sm bg-green-900 text-green-400 px-4 py-1.5 rounded font-bold uppercase">P2P Linked</span>
      {/if}
    </div>
  </div>

  <div class="w-full max-w-5xl flex gap-8">
    <div class="flex-1 flex flex-col items-center gap-6">
      <div class="bg-black border-4 border-gray-800 rounded-xl p-2 shadow-2xl relative">
        <canvas bind:this={gbaCanvas} width="240" height="160" class="w-[720px] h-[480px] bg-gray-900 rounded" style="image-rendering: pixelated;"></canvas>
      </div>

      <div class="w-full max-w-[720px] flex justify-between items-center bg-gray-900 p-4 rounded-lg border border-gray-800">
        <span class="text-sm text-blue-300 font-mono">{romName}</span>
        <label for="rom-upload" class="bg-purple-700 px-6 py-2 rounded font-bold text-sm cursor-pointer">Load ROM</label>
        <input id="rom-upload" type="file" accept=".gba" class="hidden" onchange={handleFileUpload} />
      </div>

      {#if emulator && romData}
        <div class="w-full max-w-[720px] grid grid-cols-2 gap-4">
          <div class="p-3 bg-gray-900 rounded border border-gray-800 flex flex-col gap-2">
            <span class="text-xs text-gray-500 font-bold uppercase text-center">Cloud Sync</span>
            <div class="flex gap-2">
              <button onclick={uploadSaveToCloud} class="flex-1 bg-blue-900 py-2 rounded text-xs font-bold cursor-pointer">Sync ☁️</button>
              <button onclick={downloadSaveFromCloud} class="flex-1 bg-emerald-900 py-2 rounded text-xs font-bold cursor-pointer">Load ⬇️</button>
            </div>
          </div>
          <div class="p-3 bg-gray-900 rounded border border-gray-800 flex flex-col gap-2">
            <span class="text-xs text-gray-500 font-bold uppercase text-center">Console</span>
            <div class="flex gap-2">
              <button onclick={() => emulator?.saveState(0)} class="flex-1 bg-purple-900 py-2 rounded text-xs font-bold cursor-pointer">State</button>
              <button onclick={() => { if (emulator) isFastForward = emulator.toggleFastForward() }} class="flex-1 {isFastForward ? 'bg-orange-600' : 'bg-gray-800'} py-2 rounded text-xs font-bold cursor-pointer">FF</button>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <div class="w-80 bg-black p-4 rounded-lg border border-gray-700 h-[570px] overflow-y-auto font-mono text-xs text-gray-300">
      {#each debugLogs as msg}<div>{msg}</div>{/each}
    </div>
  </div>
</div>