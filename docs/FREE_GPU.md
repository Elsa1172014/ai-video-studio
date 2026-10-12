# Making the video with no paid GPU

Story Studio can run in two ways:
1. **Online** (`/create` → Produce): needs a GPU server (`GPU_API_URL` or Runpod).
2. **Offline batch** (no server, no credit): export the plan and run it on a GPU you already have.

## Offline batch
1. In `/create`, finish the storyboard, open **Produce**, press **Export plan**. You get `story-studio.plan.json`.
2. On a machine with an NVIDIA GPU, CUDA PyTorch and ffmpeg:
   ```bash
   git clone https://github.com/Elsa1172014/ai-video-studio && cd ai-video-studio/worker
   git clone --depth 1 https://github.com/Lightricks/LTX-Video ../LTX-Video && pip install "../LTX-Video[inference]" -r requirements.txt imageio-ffmpeg
   LTX_DIR=../LTX-Video python batch.py /path/to/story-studio.plan.json --out ../out
   ```
3. The video is `out/final.mp4`, cut to exactly the planned length. Run the same command again after an interruption: finished scenes are skipped; an edited scene is redone.

Scenes that continue the same action start from the previous scene's last frame; new shots use the character reference image.

## Free notebook GPUs
`notebooks/free_gpu_batch.ipynb` runs the same command on Kaggle or Colab. **Not verified**: free GPUs (P100/T4) predate bfloat16 support, which LTX-Video targets, so it may be very slow or fail, and free quotas and rules change. A GPU of your own (RTX 3060 or better) is the dependable free path.

## What is tested
`worker/tests/test_batch.py` runs the batch runner end to end with a stand-in model and real FFmpeg: exact total length, last-frame chaining, resume, and redoing only an edited scene. The LTX call itself needs a real GPU.
