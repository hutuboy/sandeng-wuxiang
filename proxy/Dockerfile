FROM python:3.11-slim

WORKDIR /app
COPY app.py .

ENV PORT=7860
EXPOSE 7860

# 纯标准库，无需 pip install；Key 由创空间环境变量（secret）注入，绝不写进镜像
CMD ["python", "app.py"]
