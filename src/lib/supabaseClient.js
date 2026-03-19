// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';
import { get } from 'svelte/store';

const supabaseUrl = get(import.meta.env.VITE_SUPABASE_URL);
const supabaseKey = get(import.meta.env.VITE_SUPABASE_KEY);
export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});