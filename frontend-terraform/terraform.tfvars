# AWS Configuration
aws_region = "us-east-1"

# Project Configuration
project_name = "oncology-app"
environment  = "prod"

# Network Configuration
vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["us-east-1a", "us-east-1b"]
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.3.0/24", "10.0.4.0/24"]

# EC2 Configuration
instance_type         = "t3.small"
backend_instance_type = "t3.small"
key_name              = "cloud-key-pair" # Replace with your actual key pair name

# Application Configuration
docker_image         = "kandarpincanada/oncology-frontend-app:latest"
backend_docker_image = "kandarpincanada/oncology-backend-api:latest"

# Backend Environment Variables (Replace with your actual values)
sagemaker_llm_endpoint       = "https://runtime.sagemaker.us-east-1.amazonaws.com/endpoints/huggingface-pytorch-tgi-inference-2025-06-01-05-55-12-353"
sagemaker_embedding_endpoint = "https://runtime.sagemaker.us-east-1.amazonaws.com/endpoints/tei-2025-06-01-05-50-55-735"
aws_access_key_id            = "YOUR_AWS_ACCESS_KEY_ID"
aws_secret_access_key        = "YOUR_AWS_SECRET_ACCESS_KEY"
pinecone_api_key             = "pcsk_5YLaZ3_QanwxGpjGwtpBBaiXfCMj9dyCSjC2NGaa1H2iNzqCbmw6HYzAPkdceEarnNXcPR"
pinecone_index_name          = "vector-database"
