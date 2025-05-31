variable "aws_region" {
  default = "us-east-1"
}

variable "pinecone_api_key" {
  description = "Pinecone API key"
  type        = string
  sensitive   = true
}

variable "pinecone_index_name" {
  description = "Pinecone index name"
  type        = string
}

# New variables for EC2 module
variable "instance_type" {
  description = "EC2 instance type for the oncology app"
  type        = string
  default     = "t3.small"
}

variable "key_name" {
  description = "EC2 Key Pair name for SSH access"
  type        = string
}

# Optional variables
variable "vpc_id" {
  description = "VPC ID where EC2 will be deployed (defaults to default VPC)"
  type        = string
  default     = null
}

variable "subnet_id" {
  description = "Subnet ID where EC2 will be deployed (defaults to default subnet)"
  type        = string
  default     = null
}



