# AWS Configuration
aws_region = "us-east-1"
# Project Configuration
project_name = "oncology-frontend"
environment  = "prod"
# Network Configuration
vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["us-east-1a", "us-east-1b"]
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.3.0/24", "10.0.4.0/24"]
# EC2 Configuration
instance_type = "t3.small"
key_name      = "cloud-key-pair" # Replace with your actual key pair name
# Application Configuration
docker_image    = "kandarpincanada/oncology-frontend-app:latest"
backend_api_url = "https://your-backend-api.com" # Replace with your actual backend URL
