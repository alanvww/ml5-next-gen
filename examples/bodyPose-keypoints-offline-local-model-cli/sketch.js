/*
 * 👋 Hello! This is an ml5.js example made and shared with ❤️.
 * Learn more about the ml5.js project: https://ml5js.org/
 * ml5.js license and Code of Conduct: https://github.com/ml5js/ml5-next-gen/blob/main/LICENSE.md
 *
 * This example demonstrates pose tracking on live video through ml5.bodyPose,
 * with the model files loaded from a local folder instead of the internet.
 *
 * Before running it, download the model files and p5.js once.
 * INSTRUCTIONS.md in this folder has the steps.
 */

let video;
let bodyPose;
let poses = [];

async function setup() {
  createCanvas(640, 480);

  // Load the bodyPose model (MoveNet) from the local ml5-models folder.
  // modelPath is relative to index.html. For BlazePose, use:
  // ml5.bodyPose("BlazePose", { modelPath: "./ml5-models/bodypose" })
  bodyPose = await ml5.bodyPose({ modelPath: "./ml5-models/bodypose" });

  // Create the video and hide it
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  // Start detecting poses in the webcam video
  bodyPose.detectStart(video, gotPoses);
}

function draw() {
  // Draw the webcam video
  image(video, 0, 0, width, height);

  // Draw all the tracked landmark points
  for (let i = 0; i < poses.length; i++) {
    let pose = poses[i];
    for (let j = 0; j < pose.keypoints.length; j++) {
      let keypoint = pose.keypoints[j];
      // Only draw a circle if the keypoint's confidence is bigger than 0.1
      if (keypoint.confidence > 0.1) {
        fill(0, 255, 0);
        noStroke();
        circle(keypoint.x, keypoint.y, 10);
      }
    }
  }
}

// Callback function for when bodyPose outputs data
function gotPoses(results) {
  // Save the output to the poses variable
  poses = results;
}
