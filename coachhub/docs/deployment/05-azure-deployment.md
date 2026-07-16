# CoachHub — Azure Deployment Runbook (ACR + AKS)

> Deliverable 5. Applies the manifests in `deploy/k8s/` to Azure. Companion docs:
> [architecture](01-system-architecture.md) · [Docker](02-docker-deployment.md) ·
> [Kubernetes](03-kubernetes-deployment.md) · [final architecture](04-deployment-architecture.md)

**Assumptions:** subscription with Owner/Contributor, `az` CLI ≥ 2.60, `kubectl`, `helm`.
Names below (`coachhub-rg`, `coachhubacr`, `coachhub-aks`) are examples — ACR names are
globally unique, so pick your own and substitute consistently. MongoDB Atlas and Resend stay
external SaaS; only their secrets enter the cluster.

## 1. Resource group + ACR + AKS

```bash
LOCATION=westeurope
RG=coachhub-rg
ACR=coachhubacr                  # globally unique, alphanumeric only
AKS=coachhub-aks

az group create --name $RG --location $LOCATION

az acr create --resource-group $RG --name $ACR --sku Basic

# 2 small nodes is enough for the whole stack at dev/demo scale.
az aks create \
  --resource-group $RG \
  --name $AKS \
  --node-count 2 \
  --node-vm-size Standard_B2ms \
  --attach-acr $ACR \
  --enable-managed-identity \
  --generate-ssh-keys

az aks get-credentials --resource-group $RG --name $AKS
kubectl get nodes   # sanity check
```

`--attach-acr` grants the cluster pull rights on ACR — **no imagePullSecrets needed**.

## 2. Build & push images (immutable tags)

`az acr build` builds in Azure (no local Docker needed) and pushes in one step:

```bash
TAG=$(git rev-parse --short HEAD)     # never :latest

for SVC in core-api ai-service analytics-service notification-service; do
  az acr build --registry $ACR \
    --image $SVC:$TAG \
    ./services/$SVC
done
```

(Local alternative: `docker build` + `az acr login --name $ACR` + `docker push`.)

## 3. Ingress controller + cert-manager

```bash
# ingress-nginx (creates an Azure public LoadBalancer)
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace

# cert-manager
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true

# Public IP of the ingress — point your DNS A record (api.<your-domain>) at it.
kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

ClusterIssuer (apply once; replace the email):

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: you@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
```

> No custom domain? Skip cert-manager/TLS for now, and either use
> `kubectl -n coachhub port-forward svc/core-api 8080:80` or nip.io
> (`api.<INGRESS_IP>.nip.io`) as the Ingress host.

## 4. Point manifests at your ACR + set secrets

```bash
# Replace the placeholder registry with your ACR login server:
grep -rl 'coachhub.azurecr.io' deploy/k8s | xargs sed -i "s/coachhub.azurecr.io/$ACR.azurecr.io/g"
# Replace the placeholder tag with your build tag:
grep -rl ':v0.1.0' deploy/k8s | xargs sed -i "s/:v0.1.0/:$TAG/g"

# Secrets: fill the repo-root .env (gitignored — cp .env.example .env), then:
./deploy/k8s/create-secrets.sh
# → creates/updates Secret coachhub/app-secrets in the cluster. Real values
#   never touch a committed file; deploy/k8s/secrets/app-secrets.example.yaml
#   is a placeholder template only.

# Also set your real domains in 10-config/app-config.yaml and 50-ingress/ingress.yaml.
```

> Use the **rotated** Atlas URI and Gemini key in `.env` — the old ones are in git
> history. Real production: don't keep secrets in files at all — External Secrets
> Operator with **Azure Key Vault** (workload identity) or Sealed Secrets.

## 5. Deploy

Follow `deploy/k8s/README.md` (namespace → config → data → verify DBs →
migration Job → apps → ingress → HPA). Smoke test:

```bash
kubectl -n coachhub get pods                    # all Running/Ready
curl https://api.<your-domain>/health           # {"status":"ok",...} incl. database + rabbitmq
kubectl -n coachhub port-forward svc/rabbitmq 15672   # UI: queues ai.q / analytics.q / notification.q + DLQs
```

## 6. Cost notes (dev/demo scale)

| Item | SKU | ~Cost driver |
|---|---|---|
| AKS control plane | Free tier | $0 |
| 2× Standard_B2ms nodes | burstable | main cost |
| ACR | Basic | ~$5/mo |
| LoadBalancer + public IP | Standard | small |
| Disks | 2× managed-csi (10Gi + 5Gi) | small |

`az group delete --name coachhub-rg` tears everything down.

## 7. What to upgrade for real production

Same register as [doc 04 §5](04-deployment-architecture.md): Azure Database for
PostgreSQL Flexible Server (connection-string-only move), Azure Key Vault via External
Secrets, KEDA (AKS add-on: `az aks update --enable-keda`) on queue depth, RabbitMQ
Cluster Operator with quorum queues, NetworkPolicies (enable Azure/Cilium network
policy on the cluster), PodDisruptionBudgets, Azure Monitor / managed Prometheus +
alert on DLQ depth > 0.
