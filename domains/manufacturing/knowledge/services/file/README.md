# File Service

Upload, download, preview, and CAD conversion endpoints for documents/files.

## CAD conversion

DXF and SVG uploads can be previewed directly. DWG files require a converter because
DWG is a proprietary binary format. The Docker image installs `libredwg-tools`, and
the service will use `dwg2dxf`/`dwgread` automatically when available.

You can also configure a custom converter:

```bash
DWG_TO_SVG_COMMAND='your-converter --input {input} --output {output}'
```

For tools that convert DWG to DXF instead of SVG, use:

```bash
DWG_TO_DXF_COMMAND='your-dwg-to-dxf --input {input} --output {output}'
```

Commands must include `{input}` and `{output}` placeholders.

For local macOS runs with ODA File Converter installed:

```bash
DWG_TO_DXF_COMMAND='/Users/prashunjaveri/Code/monkeypatched/services/file/scripts/oda_dwg_to_dxf.sh {input} {output}'
```

If ODA is installed somewhere else, also set:

```bash
ODA_FILE_CONVERTER_BIN='/path/to/ODAFileConverter'
```

echo 'export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# docker build 
docker build -t taxion/pdf-loader/s3-loader:latest . --no-cache

# docker run
### run 
sudo docker run -d \
  --name pdf-loader-s3-loader-v4 \
  -p 8005:8005 \
  --env-file .env \
  taxion/pdf-loader/s3-loader:latest


# api docs
http://localhost:6790/docs

az login

az acr login --name taxmancanada

### push to registry 

#### linux
sudo docker tag taxion/pdf-loader/s3-loader:latest taxmancanada.azurecr.io/pdf-s3-loader/loader:latest
docker push taxmancanada.azurecr.io/pdf-loader/s3-loader:latest

#### mac
docker buildx build --platform linux/amd64 -t taxmancanada.azurecr.io/pdf-loader/s3-loader:latest .
docker push taxmancanada.azurecr.io/pdf-loader/s3-loader:latest

### logs
az container logs \
  --name pdf-loader-loader \
  --resource-group taxionResourceGroup
