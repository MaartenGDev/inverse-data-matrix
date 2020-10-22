import {
  ArgumentException,
  BinaryBitmap,
  ChecksumException,
  DecodeHintType,
  FormatException,
  HybridBinarizer,
  NotFoundException,
  Reader,
  Result,
} from '@zxing/library';
import { DecodeContinuouslyCallback } from './DecodeContinuouslyCallback';
import { HTMLCanvasElementLuminanceSource } from './HTMLCanvasElementLuminanceSource';
import { HTMLVisualMediaElement } from './HTMLVisualMediaElement';
import { IScannerControls } from './IScannerControls';

/**
 * Base class for browser code reader.
 */
export class BrowserCodeReader {

  /**
   * If navigator is present.
   */
  public get hasNavigator() {
    return typeof navigator !== 'undefined';
  }

  /**
   * If mediaDevices under navigator is supported.
   */
  public get isMediaDevicesSuported() {
    return this.hasNavigator && !!navigator.mediaDevices;
  }

  /**
   * If enumerateDevices under navigator is supported.
   */
  public get canEnumerateDevices() {
    return !!(this.isMediaDevicesSuported && navigator.mediaDevices.enumerateDevices);
  }

  /**
   * Defines what the videoElement src will be.
   *
   * @param videoElement
   * @param stream
   */
  public static addVideoSource(videoElement: HTMLVideoElement, stream: MediaStream): void {
    // Older browsers may not have `srcObject`
    try {
      // @note Throws Exception if interrupted by a new loaded request
      videoElement.srcObject = stream;
    } catch (err) {
      // @note Avoid using this in new browsers, as it is going away.
      videoElement.src = URL.createObjectURL(stream);
    }
  }

  /**
   * Checks if the given video element is currently playing.
   */
  public static isVideoPlaying(video: HTMLVideoElement): boolean {
    return video.currentTime > 0 && !video.paused && !video.ended && video.readyState > 2;
  }

  /**
   * Searches and validates a media element.
   */
  public static getMediaElement(mediaElementId: string, type: string): HTMLVisualMediaElement {

    const mediaElement = document.getElementById(mediaElementId);

    if (!mediaElement) {
      throw new ArgumentException(`element with id '${mediaElementId}' not found`);
    }

    if (mediaElement.nodeName.toLowerCase() !== type.toLowerCase()) {
      throw new ArgumentException(`element with id '${mediaElementId}' must be an ${type} element`);
    }

    return mediaElement as HTMLVisualMediaElement;
  }

  public static createVideoElement(videoThingy?: HTMLVideoElement | string): HTMLVideoElement {
    if (!videoThingy && typeof document !== 'undefined') {
      const videoElement = document.createElement('video');
      videoElement.width = 200;
      videoElement.height = 200;
      return videoElement;
    }

    if (typeof videoThingy === 'string') {
      return BrowserCodeReader.getMediaElement(videoThingy, 'video') as HTMLVideoElement;
    }

    if (videoThingy instanceof HTMLVideoElement) {
      return videoThingy;
    }

    throw new Error('Couldn\'t get videoElement from videoSource!');
  }

  public static prepareImageElement(imageSource?: HTMLImageElement | string): HTMLImageElement {

    let imageElement: HTMLImageElement;

    if (typeof imageSource === 'undefined') {
      imageElement = document.createElement('img');
      imageElement.width = 200;
      imageElement.height = 200;
    }

    if (typeof imageSource === 'string') {
      imageElement = BrowserCodeReader.getMediaElement(imageSource, 'img') as HTMLImageElement;
    }

    if (imageSource instanceof HTMLImageElement) {
      imageElement = imageSource;
    }

    return imageElement!!;
  }

  /**
   * Sets a HTMLVideoElement for scanning or creates a new one.
   *
   * @param videoElem The HTMLVideoElement to be set.
   */
  public static prepareVideoElement(videoElem?: HTMLVideoElement | string): HTMLVideoElement {

    const videoElement = BrowserCodeReader.createVideoElement(videoElem);

    // Needed for iOS 11
    videoElement.setAttribute('autoplay', 'true');
    videoElement.setAttribute('muted', 'true');
    videoElement.setAttribute('playsinline', 'true');

    return videoElement;
  }

  public static isImageLoaded(img: HTMLImageElement) {
    // During the onload event, IE correctly identifies any images that
    // weren’t downloaded as not complete. Others should too. Gecko-based
    // browsers act like NS4 in that they report this incorrectly.
    if (!img.complete) {
      return false;
    }

    // However, they do have two very useful properties: naturalWidth and
    // naturalHeight. These give the true size of the image. If it failed
    // to load, either of these should be zero.

    if (img.naturalWidth === 0) {
      return false;
    }

    // No other way of checking: assume it’s ok.
    return true;
  }

  /**
   * Creates a binaryBitmap based in a canvas.
   *
   * @param canvas HTML canvas element containing the image source draw.
   */
  public static createBinaryBitmapFromCanvas(canvas: HTMLCanvasElement) {

    const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas);
    const hybridBinarizer = new HybridBinarizer(luminanceSource);

    return new BinaryBitmap(hybridBinarizer);
  }

  /**
   * Ovewriting this allows you to manipulate the snapshot image in anyway you want before decode.
   */
  public static drawImageOnCanvas(canvasElementContext: CanvasRenderingContext2D, srcElement: HTMLVisualMediaElement) {
    canvasElementContext.drawImage(srcElement, 0, 0);
  }

  /**
   * 🖌 Prepares the canvas for capture and scan frames.
   */
  public static createCaptureCanvas(mediaElement?: HTMLVisualMediaElement): HTMLCanvasElement {

    if (typeof document === 'undefined') {
      throw new Error('The page "Document" is undefined, make sure you\'re running in a browser.');
    }

    const canvasElement = document.createElement('canvas');

    if (typeof mediaElement === 'undefined') {
      return canvasElement;
    }

    const getDimensions = () => {
      if (mediaElement instanceof HTMLVideoElement) {
        const videoWidth = mediaElement.videoWidth;
        const videoHeight = mediaElement.videoHeight;
        return { width: videoWidth, height: videoHeight };
      } else if (mediaElement instanceof HTMLImageElement) {
        const imageWidth = mediaElement.naturalWidth || mediaElement.width;
        const imageHeight = mediaElement.naturalHeight || mediaElement.height;
        return { width: imageWidth, height: imageHeight };
      }

      throw new Error('Couldn\'t find the Source\'s dimentions!');
    };

    const { width, height } = getDimensions();

    canvasElement.style.width = width + 'px';
    canvasElement.style.height = height + 'px';
    canvasElement.width = width;
    canvasElement.height = height;

    return canvasElement;
  }

  /**
   * Just tries to play the video and logs any errors.
   * The play call is only made is the video is not already playing.
   */
  public static async tryPlayVideo(videoElement: HTMLVideoElement): Promise<void> {

    if (BrowserCodeReader.isVideoPlaying(videoElement)) {
      console.warn('Trying to play video that is already playing.');
      return;
    }

    try {
      await videoElement.play();
    } catch {
      console.warn('It was not possible to play the video.');
    }
  }

  /**
   * Creates a canvas and draws the current image frame from the media element on it.
   *
   * @param mediaElement HTML media element to extract an image frame from.
   */
  public static createCanvasFromMediaElement(mediaElement: HTMLVisualMediaElement) {

    const canvas = BrowserCodeReader.createCaptureCanvas(mediaElement);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Couldn\'t find Canvas 2D Context.');
    }

    BrowserCodeReader.drawImageOnCanvas(ctx, mediaElement);

    return canvas;
  }

  /**
   * Creates a binaryBitmap based in some image source.
   *
   * @param mediaElement HTML element containing drawable image source.
   */
  public static createBinaryBitmapFromMediaElem(mediaElement: HTMLVisualMediaElement): BinaryBitmap {

    const canvas = BrowserCodeReader.createCanvasFromMediaElement(mediaElement);

    return BrowserCodeReader.createBinaryBitmapFromCanvas(canvas);
  }

  public static destroyImageElement(imageElement: HTMLImageElement): void {
    imageElement.src = '';
    imageElement.removeAttribute('src');
    imageElement = undefined;
  }

  /**
   * Unbinds a HTML video src property.
   *
   * @param videoElement
   */
  private static cleanVideoSource(videoElement: HTMLVideoElement): void {

    try {
      videoElement.srcObject = null;
    } catch (err) {
      videoElement.src = '';
    }

    if (videoElement) {
      videoElement.removeAttribute('src');
    }
  }

  /**
   * The stream output from camera.
   */
  protected stream: MediaStream | undefined;

  /**
   * The HTML video element, used to display the camera stream.
   */
  protected videoElement: HTMLVideoElement | undefined;

  /**
   * Should contain the current registered listener for video loaded-metadata,
   * used to unregister that listener when needed.
   */
  protected videoCanPlayListener?: EventListener;

  /**
   * Should contain the current registered listener for video play-ended,
   * used to unregister that listener when needed.
   */
  protected videoEndedListener?: EventListener;

  /**
   * Should contain the current registered listener for video playing,
   * used to unregister that listener when needed.
   */
  protected videoPlayingEventListener?: EventListener;

  /**
   * Creates an instance of BrowserCodeReader.
   * @param {Reader} reader The reader instance to decode the barcode
   * @param {number} [delayBetweenScanSuccess=500] Delay time between subsequent successful decode results.
   * @param hints Holds the hints the user sets for the Reader.
   * @param {number} [delayBetweenScanAttempts=500] Delay time between decode attempts made by the scanner.
   *
   * @memberOf BrowserCodeReader
   */
  public constructor(
    protected readonly reader: Reader,
    public readonly delayBetweenScanSuccess: number = 500,
    public readonly hints?: Map<DecodeHintType, any>,
    public readonly delayBetweenScanAttempts: number = 500,
  ) { }

  /**
   * Lists all the available video input devices.
   */
  public async listVideoInputDevices(): Promise<MediaDeviceInfo[]> {

    if (!this.hasNavigator) {
      throw new Error('Can\'t enumerate devices, navigator is not present.');
    }

    if (!this.canEnumerateDevices) {
      throw new Error('Can\'t enumerate devices, method not supported.');
    }

    const devices = await navigator.mediaDevices.enumerateDevices();

    const videoDevices: MediaDeviceInfo[] = [];

    for (const device of devices) {

      const kind = device.kind as string === 'video' ? 'videoinput' : device.kind;

      if (kind !== 'videoinput') {
        continue;
      }

      const deviceId = device.deviceId || (device as any).id;
      const label = device.label || `Video device ${videoDevices.length + 1}`;
      const groupId = device.groupId;

      const videoDevice = { deviceId, label, kind, groupId } as MediaDeviceInfo;

      videoDevices.push(videoDevice);
    }

    return videoDevices;
  }

  /**
   * Let's you find a device using it's Id.
   */
  public async findDeviceById(deviceId: string): Promise<MediaDeviceInfo | undefined> {

    const devices = await this.listVideoInputDevices();

    if (!devices) {
      return;
    }

    return devices.find((x) => x.deviceId === deviceId);
  }

  /**
   * In one attempt, tries to decode the barcode from the device specified by deviceId
   * while showing the video in the specified video element.
   *
   * @param deviceId the id of one of the devices obtained after calling getVideoInputDevices.
   *  Can be undefined, in this case it will decode from one of the available devices,
   *  preffering the main camera (environment facing) if available.
   * @param videoSource the video element in page where to show the video while decoding.
   *  Can be either an element id or directly an HTMLVideoElement. Can be undefined,
   *  in which case no video will be shown.
   * @returns The decoding result.
   *
   * @memberOf BrowserCodeReader
   */
  public async decodeOnceFromVideoDevice(deviceId?: string, videoSource?: string | HTMLVideoElement): Promise<Result> {

    this.reset();

    let videoConstraints: MediaTrackConstraints;

    if (!deviceId) {
      videoConstraints = { facingMode: 'environment' };
    } else {
      videoConstraints = { deviceId: { exact: deviceId } };
    }

    const constraints: MediaStreamConstraints = { video: videoConstraints };

    return await this.decodeOnceFromConstraints(constraints, videoSource);
  }

  /**
   * In one attempt, tries to decode the barcode from a stream obtained from the given
   * constraints while showing the video in the specified video element.
   *
   * @param constraints the media stream constraints to get s valid media stream to decode from
   * @param videoSource the video element in page where to show the video while decoding.
   *  Can be either an element id or directly an HTMLVideoElement. Can be undefined,
   *  in which case no video will be shown.
   * @returns The decoding result.
   *
   * @memberOf BrowserCodeReader
   */
  public async decodeOnceFromConstraints(
    constraints: MediaStreamConstraints,
    videoSource?: string | HTMLVideoElement,
  ): Promise<Result> {

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    return await this.decodeOnceFromStream(stream, videoSource);
  }

  /**
   * In one attempt, tries to decode the barcode from a stream obtained from the given
   * constraints while showing the video in the specified video element.
   *
   * @param {MediaStream} [constraints] the media stream constraints to get s valid media stream to decode from
   * @param {string|HTMLVideoElement} [video] the video element in page where to show the video while decoding.
   *  Can be either an element id or directly an HTMLVideoElement. Can be undefined,
   *  in which case no video will be shown.
   * @returns {Promise<Result>} The decoding result.
   *
   * @memberOf BrowserCodeReader
   */
  public async decodeOnceFromStream(stream: MediaStream, videoSource?: string | HTMLVideoElement): Promise<Result> {

    this.reset();

    const video = await this.attachStreamToVideo(stream, videoSource);
    const result = await this.decodeOnce(video);

    return result;
  }

  /**
   * Continuously tries to decode the barcode from the device specified by device while showing
   * the video in the specified video element.
   *
   * @param {string|null} [deviceId] the id of one of the devices obtained after calling
   *  getVideoInputDevices. Can be undefined, in this case it will decode from one of the
   *  available devices, preffering the main camera (environment facing) if available.
   * @param {string|HTMLVideoElement|null} [video] the video element in page where to show the video
   *  while decoding. Can be either an element id or directly an HTMLVideoElement. Can be undefined,
   *  in which case no video will be shown.
   *
   * @memberOf BrowserCodeReader
   */
  public async decodeFromVideoDevice(
    deviceId: string | null,
    previewElem: string | HTMLVideoElement | undefined,
    callbackFn: DecodeContinuouslyCallback,
  ): Promise<IScannerControls> {

    let videoConstraints: MediaTrackConstraints;

    if (!deviceId) {
      videoConstraints = { facingMode: 'environment' };
    } else {
      videoConstraints = { deviceId: { exact: deviceId } };
    }

    const constraints: MediaStreamConstraints = { video: videoConstraints };

    return await this.decodeFromConstraints(constraints, previewElem, callbackFn);
  }

  /**
   * Continuously tries to decode the barcode from a stream obtained from the given constraints
   * while showing the video in the specified video element.
   *
   * @param {MediaStream} [constraints] the media stream constraints to get s valid media stream to decode from
   * @param {string|HTMLVideoElement} [previewElem] the video element in page where to show the video while
   *  decoding. Can be either an element id or directly an HTMLVideoElement. Can be undefined, in
   *  which case no video will be shown.
   *
   * @memberOf BrowserCodeReader
   */
  public async decodeFromConstraints(
    constraints: MediaStreamConstraints,
    previewElem: string | HTMLVideoElement | undefined,
    callbackFn: DecodeContinuouslyCallback,
  ): Promise<IScannerControls> {

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    return await this.decodeFromStream(stream, previewElem, callbackFn);
  }

  /**
   * In one attempt, tries to decode the barcode from a stream obtained from the given constraints
   * while showing the video in the specified video element.
   *
   * @param {MediaStream} [constraints] the media stream constraints to get s valid media stream to decode from
   * @param {string|HTMLVideoElement} [preview] the video element in page where to show the video
   *  while decoding. Can be either an element id or directly an HTMLVideoElement. Can be undefined,
   *  in which case no video will be shown.
   *
   * @memberOf BrowserCodeReader
   */
  public async decodeFromStream(
    stream: MediaStream,
    preview: string | HTMLVideoElement | undefined,
    callbackFn: DecodeContinuouslyCallback,
  ): Promise<IScannerControls> {

    this.reset();

    const video = await this.attachStreamToVideo(stream, preview);

    return this.decodeContinuously(video, callbackFn);
  }

  /**
   * Decodes something from an image HTML element.
   */
  public async decodeFromImageElement(source: string | HTMLImageElement): Promise<Result> {

    if (!source) {
      throw new ArgumentException('An image element must be provided.');
    }

    const element = BrowserCodeReader.prepareImageElement(source);

    // onLoad will remove it's callback once done
    // we do not need to dispose or destroy the image
    // since it came from the user

    return await this._decodeOnLoadImage(element);
  }

  /**
   * Decodes something from an image HTML element.
   */
  public decodeFromVideoElement(source: string | HTMLVideoElement): Promise<Result> {

    const element = this._decodeFromVideoElementSetup(source);

    return this._decodeOnLoadVideo(element);
  }

  /**
   * Decodes something from an image HTML element.
   */
  public decodeFromVideoElementContinuously(
    source: string | HTMLVideoElement,
    callbackFn: DecodeContinuouslyCallback,
  ): Promise<void> {

    const element = this._decodeFromVideoElementSetup(source);

    return this._decodeOnLoadVideoContinuously(element, callbackFn);
  }

  /**
   * Decodes an image from a URL.
   */
  public async decodeFromImageUrl(url?: string): Promise<Result> {

    if (!url) {
      throw new ArgumentException('An URL must be provided.');
    }

    const element = BrowserCodeReader.prepareImageElement();

    const task = this._decodeOnLoadImage(element);

    // loads the image.
    element.src = url;

    try {
      // it waits the task so we can destroy the created image after
      return await task;
    } catch (error) {
      throw error;
    } finally {
      // we created this image element, so we destroy it
      BrowserCodeReader.destroyImageElement(element);
    }
  }

  /**
   * Decodes an image from a URL.
   */
  public decodeFromVideoUrl(url: string): Promise<Result> {

    if (!url) {
      throw new ArgumentException('An URL must be provided.');
    }

    this.reset();

    // creates a new element
    const element = BrowserCodeReader.prepareVideoElement();

    const decodeTask = this.decodeFromVideoElement(element);

    element.src = url;

    return decodeTask;
  }

  /**
   * Decodes an image from a URL.
   *
   * @experimental
   */
  public decodeFromVideoUrlContinuously(url: string, callbackFn: DecodeContinuouslyCallback): Promise<void> {

    if (!url) {
      throw new ArgumentException('An URL must be provided.');
    }

    this.reset();

    // creates a new element
    const element = BrowserCodeReader.prepareVideoElement();

    const decodeTask = this.decodeFromVideoElementContinuously(element, callbackFn);

    element.src = url;

    return decodeTask;
  }

  /**
   * Tries to decode from the video input until it finds some value.
   */
  public decodeOnce(
    element: HTMLVisualMediaElement,
    retryIfNotFound = true,
    retryIfChecksumError = true,
    retryIfFormatError = true,
  ): Promise<Result> {
    return new Promise((resolve, reject) => {

      const controls = this.decodeContinuously(element, (result, error) => {

        if (result) {
          // good result, returning
          resolve(result);
          controls.stop();
          return;
        }

        if (error) {

          // checks if it should retry

          if (error instanceof NotFoundException && retryIfNotFound) { return; }
          if (error instanceof ChecksumException && retryIfChecksumError) { return; }
          if (error instanceof FormatException && retryIfFormatError) { return; }

          // not re-trying

          controls.stop(); // stops scan loop
          reject(error); // returns the error
        }
      });

    });
  }

  /**
   * Continuously decodes from video input.
   */
  public decodeContinuously(
    element: HTMLVisualMediaElement,
    callbackFn: DecodeContinuouslyCallback,
  ): IScannerControls {

    /**
     * The HTML canvas element, used to draw the video or image's frame for decoding.
     */
    const captureCanvas = BrowserCodeReader.createCaptureCanvas(element);

    /**
     * The HTML canvas element context.
     */
    const captureCanvasContext = captureCanvas.getContext('2d');

    if (!captureCanvasContext) {
      throw new Error('Couldn\'t create canvas for visual element scan.');
    }

    let stopScan = false;
    let lastTimeoutId: number;

    const loop = () => {

      if (stopScan) {
        // no need to clear timeouts as none was create yet in this scope.
        return;
      }

      try {
        BrowserCodeReader.drawImageOnCanvas(captureCanvasContext, element);
        const result = this.decodeFromCanvas(captureCanvas);
        callbackFn(result, undefined);
        lastTimeoutId = window.setTimeout(loop, this.delayBetweenScanSuccess);
      } catch (e) {

        callbackFn(undefined, e);

        const isChecksumOrFormatError = e instanceof ChecksumException || e instanceof FormatException;
        const isNotFound = e instanceof NotFoundException;

        if (isChecksumOrFormatError || isNotFound) {
          // trying again
          lastTimeoutId = window.setTimeout(loop, this.delayBetweenScanAttempts);
        }

      }
    };

    loop();

    const stop = () => {
      stopScan = true;
      clearTimeout(lastTimeoutId);
    };

    return { stop };
  }

  /**
   * Gets the BinaryBitmap for ya! (and decodes it)
   */
  public decode(element: HTMLVisualMediaElement): Result {

    // get binary bitmap for decode function
    const binaryBitmap = BrowserCodeReader.createBinaryBitmapFromMediaElem(element);

    return this.decodeBitmap(binaryBitmap);
  }

  /**
   * @experimental
   * Decodes some barcode from a canvas!
   */
  public decodeFromCanvas(canvas: HTMLCanvasElement): Result {

    const binaryBitmap = BrowserCodeReader.createBinaryBitmapFromCanvas(canvas);

    return this.decodeBitmap(binaryBitmap);
  }

  /**
   * Call the encapsulated readers decode
   */
  public decodeBitmap(binaryBitmap: BinaryBitmap): Result {
    return this.reader.decode(binaryBitmap, this.hints);
  }

  /**
   * Resets the code reader to the initial state. Cancels any ongoing barcode scanning from video or camera.
   *
   * @memberOf BrowserCodeReader
   */
  public reset() {

    // stops the camera, preview and scan 🔴

    this.stopStreams();

    // clean and forget about HTML elements

    this._destroyVideoElement();
  }

  /**
   * Sets the new stream and request a new decoding-with-delay.
   *
   * @param stream The stream to be shown in the video element.
   * @param decodeFn A callback for the decode method.
   */
  protected async attachStreamToVideo(
    stream: MediaStream,
    preview?: string | HTMLVideoElement,
  ): Promise<HTMLVideoElement> {

    const videoElement = BrowserCodeReader.prepareVideoElement(preview);

    BrowserCodeReader.addVideoSource(videoElement, stream);

    this.videoElement = videoElement;
    this.stream = stream;

    await this.playVideoOnLoadAsync(videoElement);

    return videoElement;
  }

  /**
   *
   * @param videoElement
   */
  protected playVideoOnLoadAsync(videoElement: HTMLVideoElement): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.playVideoOnLoad(videoElement, () => resolve());
      } catch (ex) {
        reject(ex);
      }
    });
  }

  /**
   * Binds listeners and callbacks to the videoElement.
   *
   * @param element
   * @param callbackFn
   */
  protected playVideoOnLoad(element: HTMLVideoElement, callbackFn: EventListener): void {

    this.videoEndedListener = () => this.stopStreams();
    this.videoCanPlayListener = () => BrowserCodeReader.tryPlayVideo(element);

    element.addEventListener('ended', this.videoEndedListener);
    element.addEventListener('canplay', this.videoCanPlayListener);
    element.addEventListener('playing', callbackFn);

    // if canplay was already fired, we won't know when to play, so just give it a try
    BrowserCodeReader.tryPlayVideo(element);
  }

  /**
   * Stops the continuous scan and cleans the stream.
   */
  protected stopStreams(): void {
    if (this.stream) {
      this.stream.getVideoTracks().forEach((t) => t.stop());
      this.stream = undefined;
    }
  }

  /**
   * Sets up the video source so it can be decoded when loaded.
   *
   * @param source The video source element.
   */
  private _decodeFromVideoElementSetup(source: string | HTMLVideoElement) {

    if (!source) {
      throw new ArgumentException('A video element must be provided.');
    }

    this.reset();

    const element = BrowserCodeReader.prepareVideoElement(source);

    // defines the video element before starts decoding
    this.videoElement = element;

    return element;
  }

  private _waitImageLoad(element: HTMLImageElement): Promise<void> {
    return new Promise<void>((resolve) => {

      const imageLoadedListener = () => {
        // removes the listener
        element.removeEventListener('load', imageLoadedListener);
        // resolves the load
        resolve();
      };

      element.addEventListener('load', imageLoadedListener);

      // @note we can setTimeout to reject
    });
  }

  private async _decodeOnLoadImage(element: HTMLImageElement): Promise<Result> {

    const isImageLoaded = BrowserCodeReader.isImageLoaded(element);

    if (!isImageLoaded) {
      await this._waitImageLoad(element);
    }

    try {
      return this.decode(element);
    } catch (error) {
      throw error;
    }
  }

  private async _decodeOnLoadVideo(videoElement: HTMLVideoElement): Promise<Result> {
    // plays the video
    await this.playVideoOnLoadAsync(videoElement);
    // starts decoding after played the video
    return await this.decodeOnce(videoElement);
  }

  private async _decodeOnLoadVideoContinuously(
    videoElement: HTMLVideoElement,
    callbackFn: DecodeContinuouslyCallback,
  ): Promise<void> {
    // plays the video
    await this.playVideoOnLoadAsync(videoElement);
    // starts decoding after played the video
    this.decodeContinuously(videoElement, callbackFn);
  }

  private _destroyVideoElement(): void {

    const videoElement = this.videoElement;

    if (!videoElement) {
      return;
    }

    // first gives freedon to the element 🕊

    if (typeof this.videoEndedListener !== 'undefined') {
      videoElement.removeEventListener('ended', this.videoEndedListener);
    }

    if (typeof this.videoPlayingEventListener !== 'undefined') {
      videoElement.removeEventListener('playing', this.videoPlayingEventListener);
    }

    if (typeof this.videoCanPlayListener !== 'undefined') {
      videoElement.removeEventListener('loadedmetadata', this.videoCanPlayListener);
    }

    // then forgets about that element 😢

    BrowserCodeReader.cleanVideoSource(videoElement);

    this.videoElement = undefined;
  }
}
