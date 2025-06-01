#!/bin/bash
set -e

# Update system
yum update -y

# Install Docker
yum install -y docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
rpm -U ./amazon-cloudwatch-agent.rpm

# Create CloudWatch agent configuration
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << EOF
{
    "agent": {
        "metrics_collection_interval": 60,
        "run_as_user": "cwagent"
    },
    "logs": {
        "logs_collected": {
            "files": {
                "collect_list": [
                    {
                        "file_path": "/var/log/messages",
                        "log_group_name": "/aws/ec2/${name_prefix}/system",
                        "log_stream_name": "backend-{instance_id}/messages"
                    },
                    {
                        "file_path": "/var/log/docker",
                        "log_group_name": "/aws/ec2/${name_prefix}/docker",
                        "log_stream_name": "backend-{instance_id}/docker"
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

# Create docker-compose.yml for the backend application
cat > /home/ec2-user/docker-compose.yml << EOF
version: '3.8'
services:
  backend:
    image: ${docker_image}
    container_name: ${name_prefix}-backend-app
    ports:
      - "8000:8000"
    environment:
      - SAGEMAKER_LLM_ENDPOINT=${sagemaker_llm_endpoint}
      - SAGEMAKER_EMBEDDING_ENDPOINT=${sagemaker_embedding_endpoint}
      - AWS_REGION=${aws_region}
      - AWS_ACCESS_KEY_ID=${aws_access_key_id}
      - AWS_SECRET_ACCESS_KEY=${aws_secret_access_key}
      - PINECONE_API_KEY=${pinecone_api_key}
      - PINECONE_INDEX_NAME=${pinecone_index_name}
      - ENVIRONMENT=production
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
EOF

# Create systemd service for the backend application
cat > /etc/systemd/system/${name_prefix}-backend.service << EOF
[Unit]
Description=${name_prefix} Backend Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ec2-user
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
User=ec2-user

[Install]
WantedBy=multi-user.target
EOF

# Install docker-compose
curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install

# Pull the Docker image
docker pull ${docker_image}

# Change ownership of files to ec2-user
chown -R ec2-user:ec2-user /home/ec2-user/

# Enable and start the service
systemctl daemon-reload
systemctl enable ${name_prefix}-backend.service
systemctl start ${name_prefix}-backend.service

# Create log monitoring script
cat > /home/ec2-user/log-to-cloudwatch.sh << 'EOF'
#!/bin/bash
LOG_GROUP="/aws/ec2/${name_prefix}/backend"
LOG_STREAM="backend-application-$(hostname)"
AWS_REGION="${aws_region}"

# Create log stream
aws logs create-log-stream \
    --log-group-name "$LOG_GROUP" \
    --log-stream-name "$LOG_STREAM" \
    --region "$AWS_REGION" 2>/dev/null || true

# Function to send logs
send_logs() {
    local message="$1"
    local timestamp=$(date +%s000)
    
    aws logs put-log-events \
        --log-group-name "$LOG_GROUP" \
        --log-stream-name "$LOG_STREAM" \
        --log-events timestamp="$timestamp",message="$message" \
        --region "$AWS_REGION" >/dev/null 2>&1
}

# Send startup log
send_logs "Backend Application starting up..."

# Monitor docker logs and send to CloudWatch
docker logs -f ${name_prefix}-backend-app 2>&1 | while read line; do
    send_logs "$line"
done &
EOF

chmod +x /home/ec2-user/log-to-cloudwatch.sh

# Start log monitoring
su - ec2-user -c "nohup /home/ec2-user/log-to-cloudwatch.sh > /dev/null 2>&1 & echo \$! > /home/ec2-user/log-monitor.pid"

# Send completion log to CloudWatch
LOG_GROUP="/aws/ec2/${name_prefix}/system"
LOG_STREAM="backend-system-$(hostname)"
aws logs create-log-stream --log-group-name "$LOG_GROUP" --log-stream-name "$LOG_STREAM" --region "${aws_region}" 2>/dev/null || true
aws logs put-log-events --log-group-name "$LOG_GROUP" --log-stream-name "$LOG_STREAM" --log-events timestamp="$(date +%s000)",message="Backend EC2 instance setup completed successfully" --region "${aws_region}"

echo "Backend setup completed successfully!"
