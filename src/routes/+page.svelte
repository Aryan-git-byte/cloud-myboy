<script>
  import { VirtualLinkCable } from '$lib/VirtualLinkCable';
  import { GBAEngine } from '$lib/GBAEngine';
  import { supabase } from '$lib/supabaseClient';
  import { onDestroy, onMount } from 'svelte';
  
  /** @type {string} */
  let roomId = $state('quetzal-123');
  /** @type {boolean} */
  let isConnected = $state(false);
  /** @type {VirtualLinkCable | null} */
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
    if (linkCable) linkCable.disconnect();
    isConnected = false;
    linkCable = new VirtualLinkCable(
      roomId, isHost, 
      () => { isConnected = true; }, 
      (data) => {
        if (data === 'REFRESH_SAVE') downloadSaveFromCloud();
      },
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
        const result = e.target?.result;
        if (result instanceof ArrayBuffer) {
          romData = new Uint8Array(result);
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

    log("☁️ Syncing Shared Save...");
    const safeName = romName.replace(/[^a-zA-Z0-9]/g, '_') + '.sav';
    const filePath = `${roomId}/${safeName}`;
    
    const { error } = await supabase.storage
      .from('saves')
      .upload(filePath, saveData, { upsert: true });

    if (error) {
      log(`❌ Save Failed: ${error.message}`);
    } else {
      log("✅ Cloud Sync Complete!");
      if (linkCable) linkCable.sendData('REFRESH_SAVE');
    }
  }

  async function downloadSaveFromCloud() {
    if (!emulator || !romName) return;
    const safeName = romName.replace(/[^a-zA-Z0-9]/g, '_') + '.sav';
    const filePath = `${roomId}/${safeName}`;

    const { data, error } = await supabase.storage.from('saves').download(filePath);

    if (data) {
      const arrayBuffer = await data.arrayBuffer();
      emulator.injectBatterySave(new Uint8Array(arrayBuffer));
      log("🔄 Downloaded Shared Save. Restart to apply.");
    } else if (error) {
      log("ℹ️ No cloud save found for this room.");
    }
  }

  function handleFF() {
    if (emulator) isFastForward = emulator.toggleFastForward();
  }

  onDestroy(() => {
    if (linkCable) linkCable.disconnect();
    if (emulator) emulator.stop();
  });
</script>

<div class="min-h-screen bg-gray-950 text-white flex flex-col items-center p-8 font-sans">
  
  <div class="w-full max-w-5xl flex justify-between items-end mb-8 border-b border-gray-800 pb-4">
    <h1 class="text-3xl font-bold text-blue-400">MyBoy Cloud</h1>
    <div class="flex items-center gap-4">
      <input type="text" bind:value={roomId} class="p-1.5 px-3 bg-gray-900 rounded text-white font-mono text-sm border border-gray-700 outline-none w-32" />
      {#if !isConnected}
        <button onclick={() => handleConnect(true)} class="bg-green-700 hover:bg-green-600 px-4 py-1.5 rounded font-bold transition cursor-pointer">Host</button>
        <button onclick={() => handleConnect(false)} class="bg-blue-700 hover:bg-blue-600 px-4 py-1.5 rounded font-bold transition cursor-pointer">Join</button>
      {:else}
        <span class="text-sm bg-green-900 text-green-400 border border-green-500 px-4 py-1.5 rounded font-bold uppercase tracking-widest">P2P Linked</span>
      {/if}
    </div>
  </div>

  <div class="w-full max-w-5xl flex gap-8">
    <div class="flex-1 flex flex-col items-center gap-6">
      <div class="bg-black border-4 border-gray-800 rounded-xl p-2 shadow-2xl relative">
        <canvas bind:this={gbaCanvas} width="240" height="160" class="w-[720px] h-[480px] bg-gray-900 rounded" style="image-rendering: pixelated;"></canvas>
        {#if !romData}
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span class="text-gray-600 font-mono tracking-widest uppercase">Insert Cartridge</span>
          </div>
        {/if}
      </div>

      <div class="w-full max-w-[720px] flex justify-between items-center bg-gray-900 p-4 rounded-lg border border-gray-800">
        <div class="flex flex-col">
          <span class="text-xs text-gray-500 font-bold uppercase mb-1">Current Game</span>
          <span class="text-sm text-blue-300 font-mono">{romName}</span>
        </div>
        <div>
          <label for="rom-upload" class="cursor-pointer bg-purple-700 hover:bg-purple-600 px-6 py-2 rounded font-bold text-sm transition">Load .GBA File</label>
          <input id="rom-upload" type="file" accept=".gba" class="hidden" onchange={handleFileUpload} />
        </div>
      </div>

      {#if emulator && romData}
        <div class="w-full max-w-[720px] bg-gray-900 p-4 rounded-lg border border-gray-800 grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-2 p-3 bg-gray-950 rounded border border-gray-800">
            <span class="text-xs text-gray-500 font-bold uppercase text-center border-b border-gray-800 pb-1">Shared Cloud Save</span>
            <div class="flex gap-2">
              <button onclick={uploadSaveToCloud} class="flex-1 bg-blue-900 hover:bg-blue-800 text-blue-300 text-xs font-bold py-2 rounded transition cursor-pointer">Sync to Cloud ☁️</button>
              <button onclick={downloadSaveFromCloud} class="flex-1 bg-emerald-900 hover:bg-emerald-800 text-emerald-300 text-xs font-bold py-2 rounded transition cursor-pointer">Download ⬇️</button>
            </div>
          </div>

          <div class="flex flex-col gap-2 p-3 bg-gray-950 rounded border border-gray-800">
            <span class="text-xs text-gray-500 font-bold uppercase text-center border-b border-gray-800 pb-1">Quick Actions</span>
            <div class="flex gap-2">
              <button onclick={() => emulator?.saveState(0)} class="flex-1 bg-purple-900 hover:bg-purple-800 text-purple-300 text-xs font-bold py-2 rounded transition cursor-pointer">Save State</button>
              <button onclick={() => emulator?.loadState(0)} class="flex-1 bg-yellow-900 hover:bg-yellow-800 text-yellow-300 text-xs font-bold py-2 rounded transition cursor-pointer">Load State</button>
              <button onclick={handleFF} class="flex-1 {isFastForward ? 'bg-orange-600' : 'bg-gray-800'} text-white text-xs font-bold py-2 rounded transition cursor-pointer">
                FF {isFastForward ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <div class="w-80 bg-black p-4 rounded-lg shadow-lg border border-gray-700 flex flex-col h-[570px]">
      <h3 class="text-gray-400 text-sm font-bold uppercase mb-2 border-b border-gray-800 pb-2">Console Logs</h3>
      <div class="flex-1 overflow-y-auto font-mono text-xs text-gray-300 flex flex-col gap-1">
        {#each debugLogs as logMsg}
          <span class={logMsg.includes('✅') || logMsg.includes('🚀') ? 'text-green-400' : 'text-gray-300'}>{logMsg}</span>
        {/each}
      </div>
    </div>
  </div>
</div>