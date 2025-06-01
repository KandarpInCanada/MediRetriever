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

# EC2 Module
module "ec2" {
  source                = "./modules/ec2"
  name_prefix           = local.name_prefix
  vpc_id                = module.vpc.vpc_id
  public_subnet_ids     = module.vpc.public_subnet_ids
  security_group_ids    = [module.security_groups.web_security_group_id]
  instance_profile_name = module.iam.ec2_instance_profile_name
  key_name              = var.key_name
  instance_type         = var.instance_type
  docker_image          = var.docker_image
  backend_api_url       = var.backend_api_url
  cloudwatch_log_group  = module.cloudwatch.log_group_name
  tags                  = local.common_tags
}
