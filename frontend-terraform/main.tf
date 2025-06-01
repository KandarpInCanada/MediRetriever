terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Local values for common tags and naming
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
  name_prefix = "${var.project_name}-${var.environment}"
}

# VPC Module
module "vpc" {
  source               = "./modules/vpc"
  name_prefix          = local.name_prefix
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  tags                 = local.common_tags
}

# Security Groups Module
module "security_groups" {
  source      = "./modules/security-groups"
  name_prefix = local.name_prefix
  vpc_id      = module.vpc.vpc_id
  tags        = local.common_tags
}

# IAM Module
module "iam" {
  source      = "./modules/iam"
  name_prefix = local.name_prefix
  tags        = local.common_tags
}

# CloudWatch Module
module "cloudwatch" {
  source      = "./modules/cloudwatch"
  name_prefix = local.name_prefix
  tags        = local.common_tags
}

# Frontend EC2 Module
module "frontend_ec2" {
  source                = "./modules/frontend-ec2"
  name_prefix           = local.name_prefix
  vpc_id                = module.vpc.vpc_id
  public_subnet_ids     = module.vpc.public_subnet_ids
  security_group_ids    = [module.security_groups.web_security_group_id]
  instance_profile_name = module.iam.ec2_instance_profile_name
  key_name              = var.key_name
  instance_type         = var.instance_type
  docker_image          = var.docker_image
  backend_api_url       = "http://${module.backend_ec2.private_ip}:8000"
  cloudwatch_log_group  = module.cloudwatch.log_group_name
  tags                  = local.common_tags
}

# Backend EC2 Module
module "backend_ec2" {
  source                       = "./modules/backend-ec2"
  name_prefix                  = local.name_prefix
  vpc_id                       = module.vpc.vpc_id
  private_subnet_id            = module.vpc.private_subnet_ids[0]
  security_group_ids           = [module.security_groups.backend_security_group_id]
  instance_profile_name        = module.iam.ec2_instance_profile_name
  key_name                     = var.key_name
  instance_type                = var.backend_instance_type
  docker_image                 = var.backend_docker_image
  sagemaker_llm_endpoint       = var.sagemaker_llm_endpoint
  sagemaker_embedding_endpoint = var.sagemaker_embedding_endpoint
  aws_access_key_id            = var.aws_access_key_id
  aws_secret_access_key        = var.aws_secret_access_key
  pinecone_api_key             = var.pinecone_api_key
  pinecone_index_name          = var.pinecone_index_name
  cloudwatch_log_group         = module.cloudwatch.backend_log_group_name
  tags                         = local.common_tags
}
