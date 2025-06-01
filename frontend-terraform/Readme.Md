# Oncology Frontend AWS Deployment

This repository contains Terraform modules to deploy the Oncology Frontend application to AWS EC2 with proper VPC setup, CloudWatch logging, and IAM roles.

## Architecture

The deployment creates:

- **VPC** with public and private subnets across 2 AZs
- **EC2 instance** in public subnet running Docker container
- **Security Groups** for web access (ports 22, 80, 443, 3000)
- **IAM roles** and policies for CloudWatch, ECR, and SSM access
- **CloudWatch** log groups and dashboard for monitoring
- **Elastic IP** for static public IP address

## Prerequisites

1. **AWS CLI** installed and configured

   ```bash
   aws configure
   ```

2. **Terraform** installed (version >= 1.0)

   ```bash
   # On macOS
   brew install terraform

   # On Linux
   wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
   unzip terraform_1.6.0_linux_amd64.zip
   sudo mv terraform /usr/local/bin/
   ```

3. **AWS Key Pair** created in your target region
   ```bash
   aws ec2 create-key-pair --key-name oncology-frontend-key --query 'KeyMaterial' --output text > ~/.ssh/oncology-frontend-key.pem
   chmod 400 ~/.ssh/oncology-frontend-key.pem
   ```

## Quick Start

1. **Clone and setup**

   ```bash
   git clone <your-repo>
   cd terraform-deployment
   ```

2. **Configure variables**

   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

3. **Deploy**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh deploy
   ```

## Configuration

### Required Variables in `terraform.tfvars`

```hcl
# AWS Configuration
aws_region = "us-east-1"

# EC2 Configuration
key_name = "your-key-pair-name"  # Your AWS key pair name

# Application Configuration
backend_api_url = "https://your-backend-api.com"  # Your backend API URL
```

### Optional Variables

```hcl
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
docker_image  = "kandarpincanada/oncology-frontend-app:latest"
```

## Deployment Commands

### Using the deployment script (Recommended)

```bash
# Deploy infrastructure
./deploy.sh deploy

# Show deployment plan
./deploy.sh plan

# Show outputs
./deploy.sh output

# Destroy infrastructure
./deploy.sh destroy
```

### Using Terraform directly

```bash
# Initialize
terraform init

# Plan
terraform plan

# Apply
terraform apply

# Destroy
terraform destroy
```

## Monitoring and Logs

### CloudWatch Logs

The deployment creates several log groups:

- `/aws/ec2/oncology-frontend-prod/application` - Application logs
- `/aws/ec2/oncology-frontend-prod/system` - System logs
- `/aws/ec2/oncology-frontend-prod/docker` - Docker container logs

### CloudWatch Dashboard

Access the dashboard at:

```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=oncology-frontend-prod-dashboard
```

### EC2 Instance Access

```bash
# SSH to the instance
ssh -i ~/.ssh/your-key.pem ec2-user@<public-ip>

# Check application status
sudo systemctl status oncology-frontend

# View application logs
docker logs oncology-frontend-app

# Restart application
sudo systemctl restart oncology-frontend
```

## Application Configuration

The application receives the following environment variables:

- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NODE_ENV=production` - Production environment

## Security Features

- **Security Groups**: Restrictive inbound rules
- **IAM Roles**: Least privilege access
- **Encrypted Storage**: EBS volumes encrypted
- **VPC**: Network isolation with public/private subnets

## Troubleshooting

### Application not accessible

1. Check security group allows port 3000
2. Verify application is running: `docker ps`
3. Check application logs: `docker logs oncology-frontend-app`
4. Ensure Docker service is running: `sudo systemctl status docker`

### CloudWatch logs not appearing

1. Check IAM role has CloudWatch permissions
2. Verify CloudWatch agent is running:
   ```bash
   sudo systemctl status amazon-cloudwatch-agent
   ```
3. Check agent configuration:
   ```bash
   sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -a query
   ```

### Docker container not starting

1. Check if image exists: `docker images`
2. Try pulling manually: `docker pull kandarpincanada/oncology-frontend-app:latest`
3. Check container logs: `docker logs oncology-frontend-app`
4. Verify environment variables: `docker inspect oncology-frontend-app`

## Cost Optimization

- **Instance Type**: Start with t3.small, scale as needed
- **EBS Volumes**: gp3 for cost efficiency
- **CloudWatch**: 7-day log retention to reduce costs
- **Elastic IP**: Released when infrastructure is destroyed

## Module Structure

```
├── main.tf                     # Root configuration
├── variables.tf               # Root variables
├── outputs.tf                 # Root outputs
├── terraform.tfvars.example   # Variable examples
├── deploy.sh                  # Deployment script
├── modules/
│   ├── vpc/                   # VPC module
│   ├── security-groups/       # Security groups module
│   ├── iam/                   # IAM roles and policies
│   ├── cloudwatch/            # CloudWatch logs and dashboard
│   └── ec2/                   # EC2 instance and user data
```

## Next Steps

After successful deployment:

1. **Configure Domain**: Point your domain to the Elastic IP
2. **SSL Certificate**: Add SSL/TLS using AWS Certificate Manager
3. **Load Balancer**: Add ALB for high availability
4. **Auto Scaling**: Implement auto scaling groups
5. **Monitoring**: Set up CloudWatch alarms
6. **Backup**: Configure EBS snapshots

## Support

For issues:

1. Check CloudWatch logs
2. SSH to instance and check system logs
3. Verify Docker container status
4. Review security group and network configuration
