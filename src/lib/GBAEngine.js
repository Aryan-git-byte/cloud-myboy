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
    this.onLog(`🕹️ Initializing mGBA Core...`);
    try {
      this.module = await mGBA({ canvas: this.canvas });
      
      // Initialize the virtual filesystem
      await this.module.FSInit();

      this.safeRomName = romName.replace(/[^a-zA-Z0-9]/g, '_');
      
      // We write the ROM to the root. mGBA usually creates saves in the same place.
      const virtualPath = '/' + this.safeRomName + '.gba';
      this.module.FS.writeFile(virtualPath, romData);
      
      const loadSuccess = this.module.loadGame(virtualPath);
      
      if (loadSuccess) {
        this.onLog("🚀 Game Booted!");
        // Force Flash 128K Save Type (Required for Pokémon Emerald/Quetzal)
        if (this.module.setSaveType) this.module.setSaveType(4); 
        if (this.module.resumeGame) this.module.resumeGame();
        this.isRunning = true;
      }
    } catch (error) {
      const e = /** @type {Error} */ (error);
      this.onLog(`❌ WASM Error: ${e.message}`);
    }
  }

  /**
   * Recursively scans the virtual filesystem for .sav files
   * @returns {Uint8Array | null}
   */
  exportBatterySave() {
    if (!this.module) return null;
    
    // Force mGBA to flush RAM to the virtual disk
    if (this.module.syncSave) this.module.syncSave();

    const expectedName = this.safeRomName + '.sav';
    
    /**
     * @param {string} dir
     * @returns {string | null}
     */
    const findSavePath = (dir) => {
      try {
        const files = this.module.FS.readdir(dir);
        for (const file of files) {
          if (file === '.' || file === '..') continue;
          const fullPath = dir === '/' ? `/${file}` : `${dir}/${file}`;
          
          if (file === expectedName) return fullPath;
          
          // If it's a directory, look inside
          try {
            const stat = this.module.FS.stat(fullPath);
            if (this.module.FS.isDir(stat.mode)) {
              const found = findSavePath(fullPath);
              if (found) return found;
            }
          } catch (e) { /* skip */ }
        }
      } catch (e) { /* skip */ }
      return null;
    };

    const actualPath = findSavePath('/');

    if (actualPath) {
      try {
        const data = this.module.FS.readFile(actualPath);
        this.onLog(`✅ Save Found at: ${actualPath}`);
        return data;
      } catch (e) {
        this.onLog("❌ Failed to read save file.");
      }
    } else {
      this.onLog("⚠️ No .sav file found in any folder. Did you SAVE in the Pokemon game menu?");
    }
    return null;
  }

  /** @param {Uint8Array} saveData */
  injectBatterySave(saveData) {
    if (!this.module) return;
    // We inject it into the root, and mGBA will find it when the game loads
    this.module.FS.writeFile('/' + this.safeRomName + '.sav', saveData);
    this.onLog("☁️ Cloud Save Injected into root.");
  }

  /** @param {number} slot */
  saveState(slot = 0) {
    if (this.module) {
      this.module.saveState(slot);
      this.onLog(`📸 State ${slot} Saved.`);
    }
  }

  /** @param {number} slot */
  loadState(slot = 0) {
    if (this.module) {
      this.module.loadState(slot);
      this.onLog(`⏪ State ${slot} Loaded.`);
    }
  }

  toggleFastForward() {
    if (!this.module) return false;
    this.isFF = !this.isFF;
    if (this.isFF && this.module.fastForward) this.module.fastForward();
    else if (this.module.normalSpeed) this.module.normalSpeed();
    return this.isFF;
  }

  stop() {
    if (this.module && this.module.quitGame) this.module.quitGame();
    this.isRunning = false;
  }
}