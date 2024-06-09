let lastResult = '';


Module = {};
Module.onRuntimeInitialized = function () {
  app.is_stt_not_ready = false;
  recognizer = createRecognizer(Module);
  app.stt_started = true;
};

let audioCtx;
let mediaStream;

let expectedSampleRate = 16000;
let recordSampleRate;  // the sampleRate of the microphone
let recorder = null;   // the microphone
let leftchannel = [];  // TODO: Use a single channel

let recordingLength = 0;  // number of samples so far

let recognizer = null;
let recognizer_stream = null;

if (navigator.mediaDevices.getUserMedia) {
  console.log('getUserMedia supported.');
  const constraints = { audio: true };
  let onSuccess = function (stream) {
    if (!audioCtx) {
      audioCtx = new AudioContext({ sampleRate: 16000 });
    }
    console.log(audioCtx);
    recordSampleRate = audioCtx.sampleRate;
    // console.log('sample rate ' + recordSampleRate);
    // creates an audio node from the microphone incoming stream
    mediaStream = audioCtx.createMediaStreamSource(stream);
    // console.log('media stream', mediaStream);
    // https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createScriptProcessor
    // bufferSize: the onaudioprocess event is called when the buffer is full
    var bufferSize = 4096;
    var numberOfInputChannels = 1;
    var numberOfOutputChannels = 2;
    if (audioCtx.createScriptProcessor) {
      recorder = audioCtx.createScriptProcessor(
        bufferSize, numberOfInputChannels, numberOfOutputChannels);
    } else {
      recorder = audioCtx.createJavaScriptNode(
        bufferSize, numberOfInputChannels, numberOfOutputChannels);
    }
    // console.log('recorder', recorder);
    recorder.onaudioprocess = function (e) {
      let samples = new Float32Array(e.inputBuffer.getChannelData(0))
      samples = downsampleBuffer(samples, expectedSampleRate);
      if (recognizer_stream == null) {
        recognizer_stream = recognizer.createStream();
      }
      recognizer_stream.acceptWaveform(expectedSampleRate, samples);
      while (recognizer.isReady(recognizer_stream)) {
        recognizer.decode(recognizer_stream);
      }
      let isEndpoint = recognizer.isEndpoint(recognizer_stream);
      let result = recognizer.getResult(recognizer_stream);
      if (result.length > 0 && lastResult != result) {
        lastResult = result;
        if (!app.show_dialog) {

          app.question = lastResult
        } else {

          app.dialog_input = lastResult
        }
      }

      if (isEndpoint) {
        if (lastResult.length > 0) {
          if (!app.show_dialog) {
            submit()
          } else {

            app.show_dialog = false;
            window.dialog_input_resolver()
          }
          lastResult = '';
        }
        recognizer.reset(recognizer_stream);
      }


      let buf = new Int16Array(samples.length);
      for (var i = 0; i < samples.length; ++i) {
        let s = samples[i];
        if (s >= 1)
          s = 1;
        else if (s <= -1)
          s = -1;

        samples[i] = s;
        buf[i] = s * 32767;
      }

      // leftchannel.push(buf);
      recordingLength += bufferSize;
    };

    startSST = function () {
      mediaStream.connect(recorder);
      recorder.connect(audioCtx.destination);

      // console.log('recorder started');

    };

    stopSST = function () {
      recorder.disconnect(audioCtx.destination);
      mediaStream.disconnect(recorder);
      // console.log('recorder stopped');

    };
  };

  let onError = function (err) {
    alerr('语音识别错误: ' + err);
  };

  navigator.mediaDevices.getUserMedia(constraints).then(onSuccess, onError);
} else {
  alert('语音识别错误: 浏览器不支持');
}


// this function is copied from
// https://github.com/awslabs/aws-lex-browser-audio-capture/blob/master/lib/worker.js#L46
function downsampleBuffer(buffer, exportSampleRate) {
  if (exportSampleRate === recordSampleRate) {
    return buffer;
  }
  var sampleRateRatio = recordSampleRate / exportSampleRate;
  var newLength = Math.round(buffer.length / sampleRateRatio);
  var result = new Float32Array(newLength);
  var offsetResult = 0;
  var offsetBuffer = 0;
  while (offsetResult < result.length) {
    var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    var accum = 0, count = 0;
    for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
};
