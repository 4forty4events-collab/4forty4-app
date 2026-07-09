import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xgdhicsuzhizfptcusat.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnZGhpY3N1emhpemZwdGN1c2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTU3MTgsImV4cCI6MjA5Njc3MTcxOH0.ji7ZTsME75xUjF5kFWDTpNCvFTfKbT5d9-sEEhis34Q'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE is the flow the Google OAuth redirect uses: the provider returns a
    // ?code= that we exchange for a session (exchangeCodeForSession). Harmless
    // for the dormant phone-OTP path.
    flowType: 'pkce',
  },
})