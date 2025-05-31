#!/bin/bash

# Enable logging
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
echo "Starting user data script execution at $(date)"

# Update system
yum update -y

# Install Docker
yum install -y docker

# Start and enable Docker service
systemctl start docker
systemctl enable docker

# Add ec2-user to docker group
usermod -a -G docker ec2-user

# Verify Docker is running
if ! systemctl is-active --quiet docker; then
    echo "ERROR: Docker failed to start"
    exit 1
fi

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Create environment file
cat > /home/ec2-user/.env << 'EOF'
%{ for key, value in environment_variables ~}
${key}=${value}
%{ endfor ~}
EOF

# Change ownership of .env file
chown ec2-user:ec2-user /home/ec2-user/.env

# Wait a moment for Docker to be fully ready
sleep 5

# Check system architecture
ARCH=$(uname -m)
echo "System architecture: $ARCH"

# Pull Docker image with explicit platform specification
echo "Pulling Docker image: ${docker_image}"
docker pull --platform linux/amd64 ${docker_image}

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to pull Docker image ${docker_image} for linux/amd64"
    echo "Attempting to pull without platform specification..."
    docker pull ${docker_image}
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to pull Docker image ${docker_image}"
        exit 1
    fi
fi

# Stop any existing container with the same name
docker stop oncology-app 2>/dev/null || true
docker rm oncology-app 2>/dev/null || true

# Run the container with environment variables and explicit platform
echo "Starting Docker container..."
docker run -d \
  --name oncology-app \
  --restart unless-stopped \
  --platform linux/amd64 \
  -p 80:${app_port} \
  -p ${app_port}:${app_port} \
  %{ for key, value in environment_variables ~}
  -e ${key}="${value}" \
  %{ endfor ~}
  ${docker_image}

# Verify container is running
sleep 10
if ! docker ps | grep -q oncology-app; then
    echo "ERROR: Container failed to start"
    echo "Container logs:"
    docker logs oncology-app
    echo "Trying to inspect the image..."
    docker inspect ${docker_image}
    exit 1
fi

echo "Container started successfully"
docker ps

# Install CloudWatch agent for monitoring
echo "Installing CloudWatch agent..."
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
rpm -U ./amazon-cloudwatch-agent.rpm

# Configure CloudWatch agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'EOF'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/user-data.log",
            "log_group_name": "oncology-app-user-data-logs",
            "log_stream_name": "{instance_id}"
          },
          {
            "file_path": "/var/log/docker",
            "log_group_name": "oncology-app-docker-logs",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "CWAgent",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          "cpu_usage_idle",
          "cpu_usage_iowait",
          "cpu_usage_user",
          "cpu_usage_system"
        ],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": [
          "used_percent"
        ],
        "metrics_collection_interval": 60,
        "resources": [
          "*"
        ]
      },
      "diskio": {
        "measurement": [
          "io_time"
        ],
        "metrics_collection_interval": 60,
        "resources": [
          "*"
        ]
      },
      "mem": {
        "measurement": [
          "mem_used_percent"
        ],
        "metrics_collection_interval": 60
      }
    }
  }
}
EOF

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
    -s

echo "User data script completed successfully at $(date)"