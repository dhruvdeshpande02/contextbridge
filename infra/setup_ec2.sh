#!/usr/bin/env bash
# Run ONCE on a fresh EC2 Ubuntu 22.04 instance to install Docker + Docker Compose.
# Usage: ssh in, then: curl -fsSL https://raw.githubusercontent.com/<you>/contextbridge/main/infra/setup_ec2.sh | bash
set -euo pipefail

echo "Updating packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

echo "Installing Docker..."
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

echo "Allowing current user to run docker without sudo..."
sudo usermod -aG docker "$USER"

echo "Installing git..."
sudo apt-get install -y git

echo "Done. Log out and back in (or run 'newgrp docker') for group changes to take effect."
echo "Next: git clone your repo, copy .env.prod.example to .env, fill in real secrets, then run infra/deploy.sh"
