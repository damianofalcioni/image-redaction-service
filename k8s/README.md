# Kubernetes deployment

This folder deploys the service as a Kubernetes `Deployment` plus an internal `ClusterIP` service.
The same HTTP server exposes:

- `GET /health`
- `GET /openapi.yaml`
- `POST /v1/images/blur-sensitive-regions`
- `POST /mcp`

## 1. Build and push the image

Replace the registry path with your own registry:

```bash
docker build -t ghcr.io/YOUR_ORG/image-redaction-service:0.3.4 .
docker push ghcr.io/YOUR_ORG/image-redaction-service:0.3.4
```

## 2. Update the image in Kubernetes

Edit `k8s/deployment.yaml`, or use Kustomize:

```bash
kubectl kustomize k8s | sed 's#ghcr.io/YOUR_ORG/image-redaction-service:0.3.4#YOUR_REGISTRY/image-redaction-service:0.3.4#g' | kubectl apply -f -
```

For a simple direct deployment after editing the image:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

## 3. Test inside the cluster

```bash
kubectl -n image-redaction rollout status deployment/image-redaction-service
kubectl -n image-redaction get pods
kubectl -n image-redaction port-forward svc/image-redaction-service 3000:80
curl http://localhost:3000/health
curl http://localhost:3000/openapi.yaml
```

## 4. Expose outside the cluster

Option A: use the included `k8s/ingress.yaml` after changing:

- `spec.ingressClassName`
- `spec.rules[0].host`
- TLS settings, if needed

Then apply it:

```bash
kubectl apply -f k8s/ingress.yaml
```

Option B: change the service type from `ClusterIP` to `LoadBalancer` if your cluster supports external load balancers.

## Runtime configuration

Defaults are stored in `k8s/configmap.yaml` and mirror the project `.env` file.
Keep `ALLOW_REMOTE_IMAGE_SOURCE=false` unless you explicitly trust the network path, because remote image fetching can create SSRF risk.
