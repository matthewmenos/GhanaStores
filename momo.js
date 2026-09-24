import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

// 1. Paste your Primary Subscription Key here
const SUBSCRIPTION_KEY = 'YOUR_PRIMARY_COLLECTIONS_KEY_HERE';

// 2. Generate a fresh UUID v4 to act as your API User ID
const userId = uuidv4();

async function generateMomoSandboxCredentials() {
  try {
    console.log(`[1/2] Creating API User UUID: ${userId}...`);

    // Step A: Provision API User
    const createUserRes = await fetch('https://sandbox.momodeveloper.mtn.com/v1_0/apiuser', {
      method: 'POST',
      headers: {
        'X-Reference-Id': userId,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ providerCallbackHost: 'webhook.site' })
    });

    if (createUserRes.status !== 201) {
      throw new Error(`API User Creation Failed with status ${createUserRes.status}`);
    }

    console.log(`[2/2] Generating API Key for User ID...`);

    // Step B: Generate API Key for created User ID
    const createKeyRes = await fetch(`https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/${userId}/apikey`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!createKeyRes.ok) {
      throw new Error(`API Key Generation Failed with status ${createKeyRes.status}`);
    }

    const keyData = await createKeyRes.json();

    console.log('\n======================================================');
    console.log(' SUCCESS! Copy these exact values into your .env file:');
    console.log('======================================================\n');
    console.log(`MTN_MOMO_BASE_URL=https://sandbox.momodeveloper.mtn.com`);
    console.log(`MTN_MOMO_SUBSCRIPTION_KEY=${SUBSCRIPTION_KEY}`);
    console.log(`MTN_MOMO_COLLECTION_USER_ID=${userId}`);
    console.log(`MTN_MOMO_COLLECTION_API_KEY=${keyData.apiKey}\n`);

  } catch (error) {
    console.error('Error provisioning MoMo credentials:', error.message);
  }
}

generateMomoSandboxCredentials();