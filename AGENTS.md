# Project conventions

- Write all project code, scripts, comments, log messages, configuration comments,
  tests, and documentation in English.
- Use Chinese for conversations with the user.
- Keep this project incremental and easy to explain to a beginner.
- For subsequent feature work, guide the user one small step at a time. Explain
  what to do, its role in the project, and why it is the next step. Explain new
  code line by line and let the user write it and run commands themselves.
- Do not implement or deploy subsequent features on the user's behalf unless
  explicitly asked to do so. Wait for the user's results before advancing.
- Use the existing StorageLab Colima profile, Docker context, and dedicated
  kubeconfig. Do not change global contexts or recreate the cluster by default.
