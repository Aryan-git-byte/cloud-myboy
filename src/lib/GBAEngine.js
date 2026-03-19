import mGBA from '@thenick775/mgba-wasm';

export class GBAEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {(msg: string) => void} onLog
   */
  constructor(canvas, onLog) {
    this.canvas = canvas;
    this.onLog = onLog;
    /** @type {any} */
    this.module = null; 
    this.isRunning = false;
    this.safeRomName = "game";
    this.isFF = false;
  }

  /**
   * @param {Uint8Array} romData 
   * @param {string} romName 
   */
  async loadRom(romData, romName) {
    this.onLog(`🕹️ Initializing mGBA...`);
    try {
      this.module = await mGBA({ canvas: this.canvas });
      await this.module.FSInit();

      this.safeRomName = romName.replace(/[^a-zA-Z0-9]/g, '_');
      const virtualPath = '/' + this.safeRomName + '.gba';
      
      this.module.FS.writeFile(virtualPath, romData);
      
      // Check for existing save in memory if we are re-injecting
      const loadSuccess = this.module.loadGame(virtualPath);
      
      if (loadSuccess) {
        this.onLog("🚀 Game Booted!");
        if (this.module.resumeGame) this.module.resumeGame();
        this.isRunning = true;
      }
    } catch (error) {
      const e = /** @type {Error} */ (error);
      this.onLog(`❌ WASM Error: ${e.message}`);
    }
  }

  /**
   * Rips the in-game save (.sav)
   * @returns {Uint8Array | null}
   */
  exportBatterySave() {
    if (!this.module) return null;
    
    // Force mGBA to flush RAM to the virtual disk
    if (this.module.syncSave) this.module.syncSave();

    const savePath = '/' + this.safeRomName + '.sav';
    try {
      // Check if file exists before reading to avoid crashing
      const files = this.module.FS.readdir('/');
      if (!files.includes(this.safeRomName + '.sav')) {
        this.onLog("⚠️ No save file found yet. Save in the Pokemon menu first!");
        return null;
      }

      const saveData = this.module.FS.readFile(savePath);
      return saveData;
    } catch (e) {
      this.onLog("⚠️ Save data not accessible.");
      return null;
    }
  }

  /** @param {Uint8Array} saveData */
  injectBatterySave(saveData) {
    if (!this.module) return;
    const savePath = '/' + this.safeRomName + '.sav';
    try {
      this.module.FS.writeFile(savePath, saveData);
      this.onLog("☁️ Cloud Save Injected.");
    } catch (e) {
      this.onLog("❌ Injection failed.");
    }
  }

  /** @param {number} slot */
  saveState(slot = 0) {
    if (this.module) this.module.saveState(slot);
  }

  /** @param {number} slot */
  loadState(slot = 0) {
    if (this.module) this.module.loadState(slot);
  }

  toggleFastForward() {
    if (!this.module) return false;
    this.isFF = !this.isFF;
    
    if (this.isFF && this.module.fastForward) {
      this.module.fastForward();
      return true;
    } else if (this.module.normalSpeed) {
      this.module.normalSpeed();
      return false;
    }
    return false;
  }

  stop() {
    if (this.module && this.module.quitGame) this.module.quitGame();
    this.isRunning = false;
  }
}