variable "name_prefix" {
  description = "Name prefix for resources"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where EC2 instance will be created"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "instance_profile_name" {
  description = "Name of the IAM instance profile"
  type        = string
}

variable "key_name" {
  description = "AWS Key Pair name for EC2 instances"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small"
}

variable "docker_image" {
  description = "Docker image to deploy"
  type        = string
}

variable "backend_api_url" {
  description = "Backend API URL to pass as environment variable"
  type        = string
}

variable "cloudwatch_log_group" {
  description = "CloudWatch log group name for application logs"
  type        = string
}

variable "tags" {
  description = "A map of tags to assign to the resource"
  type        = map(string)
  default     = {}
}
