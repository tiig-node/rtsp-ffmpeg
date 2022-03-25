import { spawn } from "child_process";
import EventEmitter from "events";

export interface RTSPFFMpegOptions {
  input: string; // Stream uri, for example rtsp://freja.hiof.no:1935/rtplive/definst/hessdalen03.stream
  rate?: number; // Framerate
  resolution?: string; // Resolution in WxH format
  quality?: number; // JPEG quality
  arguments?: string[]; // Custom arguments for ffmpeg
}

export class RTSPFFMpeg extends EventEmitter {
  /**
   * FFMpeg command name
   *
   * @type {string}
   */
  cmd: string = "ffmpeg";
  input: any;
  rate: any;
  resolution: any;
  quality: any;
  arguments: any;
  buff: any;
  child: any;

  constructor (options: RTSPFFMpegOptions) {
    super();
    if (options.input) {
      this.input = options.input;
    } else {
      throw new Error("no `input` parameter");
    }
    this.rate       = options.rate || 10;
    this.resolution = options.resolution;
    this.quality    = (options.quality === undefined || !options.quality) ? 3 : options.quality;
    this.arguments  = options.arguments || [];
    this.buff       = Buffer.from(""); // Store the entire data image into this variable. This attribute is replaced each time a full image is received from the stream.
  }

  _args () {
    return [
      "-loglevel", "quiet",
      "-i", this.input,
      "-r", this.rate.toString(),
      ...this.quality && ["-q:v", this.quality.toString()] || [],
      ...this.resolution && ["-s", this.resolution] || [],
      // '-vf', 'fps=25',
      // '-b:v', '32k',
      "-f", "image2",
      "-update", "1",
      // "-vf", "eq=gamma=1.8:saturation=0.9",
      "-"
    ];
  };

  /**
   * Start ffmpeg spawn process
   */
  start () {
    const self = this;
    if (this.child) return;
    this.child = spawn(this.cmd, this._args());
    this.child.stdout.on("data", (data) => {
      // The image can be composed of one or multiple chunk when receiving stream data.
      // Store all bytes into an array until we meet flag "FF D9" that mean it's the end of the image then we can send all data in order to display the full image.
      if (data.length > 1) {
        self.buff = Buffer.concat([self.buff, data]);

        const offset  = data[data.length-2].toString(16);
        const offset2 = data[data.length-1].toString(16);

        if (offset == "ff" && offset2 == "d9") {
          self.emit("data", self.buff);
          self.buff = Buffer.from("");
        }
      }
    });
    this.child.stderr.on("data", (data) => {
      throw new Error(data);
    });
    this.emit("start");
    this.child.on("close", (code) => {
      if (code === 0) {
        setTimeout(() => {
          this.start();
        }, 1000);
      }
    });
    this.child.on("error", (err) => {
      if (err.code === "ENOENT") {
        throw new Error("FFMpeg executable wasn't found. Install this package and check FFMpeg.cmd property");
      } else {
        throw err;
      }
    });
  };

  /**
   * Stop ffmpeg spawn process
   */
  stop () {
    if (this.child) {
      this.child.kill();
    }
    // delete this.child;
    this.child = null;
    this.emit("stop");
  };

  /**
   * Restart ffmpeg spawn process
   */
  restart () {
    if (this.child) {
      this.stop();
      this.start();
    }
  };
}
