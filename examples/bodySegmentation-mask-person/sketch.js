/*
 * 👋 Hello! This is an ml5.js example made and shared with ❤️.
 * Learn more about the ml5.js project: https://ml5js.org/
 * ml5.js license and Code of Conduct: https://github.com/ml5js/ml5-next-gen/blob/main/LICENSE.md
 *
 * This example demonstrates segmenting the background from a person with ml5.bodySegmentation.
 */

let bodyPix;
let video;
let segmentation;

let options = {
  maskType: "person",
};

function preload() {
  bodyPix = ml5.bodySegmentation("SelfieSegmentation", options);
}

function setup() {
  createCanvas(640, 480);
  // Create the video
  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  bodyPix.detectStart(video, gotResults);
}

function draw() {
  background(0, 255, 0);

  if (segmentation) {
    video.mask(segmentation);
    image(video, 0, 0);
  }
}
// callback function for body segmentation
function gotResults(result) {
  segmentation = result.mask;
}