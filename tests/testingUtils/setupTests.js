import crossFetch from 'cross-fetch';
import * as tf from '@tensorflow/tfjs';

async function setupTests() {

  console.log("Beginning setup");

  await tf.setBackend('cpu');
  tf.env().set('IS_BROWSER', false);
  tf.env().set('IS_NODE', true);

  // Use cross-fetch as a polyfill for the browser fetch
  if (!global.fetch) {
    global.fetch = crossFetch;
  }

  console.log("Setup complete");
}

module.exports = setupTests;
